const express = require('express');
const db = require('../db');
const { ensureAuth, ensureAdmin } = require('../middleware/auth');
const { toInputDate } = require('../config/helpers');
const gcal = require('../config/google');

const router = express.Router();

const DAY_MS = 24 * 60 * 60 * 1000;

function pad(n) { return String(n).padStart(2, '0'); }
function dateKey(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

// Normaliza el valor de un campo que puede venir como string o array.
function toArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

// ---------- Vista mensual ----------
router.get('/calendar', ensureAuth, async (req, res, next) => {
  try {
    const isAdmin = req.user.role === 'admin';

    // Mes a mostrar (?mes=YYYY-MM); por defecto, el actual.
    const now = new Date();
    let year = now.getFullYear();
    let month = now.getMonth(); // 0-11
    const m = /^(\d{4})-(\d{2})$/.exec(req.query.mes || '');
    if (m) { year = parseInt(m[1], 10); month = parseInt(m[2], 10) - 1; }

    const firstOfMonth = new Date(year, month, 1);
    // La grilla empieza un lunes.
    const offset = (firstOfMonth.getDay() + 6) % 7;
    const gridStart = new Date(year, month, 1 - offset);
    const gridEnd = new Date(gridStart.getTime() + 42 * DAY_MS);

    const startKey = dateKey(gridStart);
    const endKey = dateKey(gridEnd);

    // Calendario compartido: todos ven todos los eventos del mes.
    const { rows } = await db.query(
      `SELECT e.*, u.name AS creator_name
         FROM events e
         LEFT JOIN users u ON u.id = e.created_by
        WHERE e.event_date >= $1 AND e.event_date < $2
        ORDER BY e.event_date, e.all_day DESC, e.start_time NULLS FIRST`,
      [startKey, endKey]
    );

    // Agrupamos eventos por día.
    const byDay = {};
    rows.forEach((e) => {
      const key = toInputDate(e.event_date);
      (byDay[key] = byDay[key] || []).push(e);
    });

    // Construimos 6 semanas de 7 días.
    const weeks = [];
    const todayKey = dateKey(new Date());
    for (let w = 0; w < 6; w++) {
      const days = [];
      for (let dow = 0; dow < 7; dow++) {
        const cellDate = new Date(gridStart.getTime() + (w * 7 + dow) * DAY_MS);
        const key = dateKey(cellDate);
        days.push({
          key,
          day: cellDate.getDate(),
          inMonth: cellDate.getMonth() === month,
          isToday: key === todayKey,
          events: byDay[key] || [],
        });
      }
      weeks.push(days);
    }

    const prevMonth = new Date(year, month - 1, 1);
    const nextMonth = new Date(year, month + 1, 1);
    const monthLabel = firstOfMonth.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });

    // Próximos eventos (desde hoy).
    const upcoming = rows
      .filter((e) => toInputDate(e.event_date) >= todayKey)
      .slice(0, 8);

    const adminG = await gcal.getAdminWithDrive();

    res.render('calendar', {
      title: 'Calendario',
      weeks,
      monthLabel,
      prevMes: `${prevMonth.getFullYear()}-${pad(prevMonth.getMonth() + 1)}`,
      nextMes: `${nextMonth.getFullYear()}-${pad(nextMonth.getMonth() + 1)}`,
      isAdmin,
      calendarConnected: !!adminG,
      upcoming,
    });
  } catch (err) {
    next(err);
  }
});

// ---------- Formulario de nuevo evento ----------
router.get('/events/new', ensureAuth, async (req, res, next) => {
  try {
    const { rows: users } = await db.query(
      `SELECT id, name, email FROM users WHERE role <> 'admin' OR id <> $1 ORDER BY name ASC`,
      [req.user.id]
    );
    const adminG = await gcal.getAdminWithDrive();
    res.render('event_form', {
      title: 'Nuevo evento',
      users,
      defaultDate: req.query.fecha || toInputDate(new Date()),
      calendarConnected: !!adminG,
    });
  } catch (err) {
    next(err);
  }
});

// ---------- Crear evento ----------
router.post('/events', ensureAuth, async (req, res, next) => {
  const client = await db.pool.connect();
  try {
    const { title, description, location, event_date, start_time, end_time } = req.body;
    const allDay = req.body.all_day === 'on';
    const allTeam = req.body.all_team === 'on';
    const attendeeIds = toArray(req.body.attendees).map((x) => parseInt(x, 10)).filter(Boolean);

    if (!title || !title.trim() || !event_date) {
      req.session.flash = { type: 'error', text: 'El evento necesita título y fecha.' };
      return res.redirect('/events/new');
    }

    await client.query('BEGIN');
    const ins = await client.query(
      `INSERT INTO events (title, description, location, event_date, start_time, end_time, all_day, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        title.trim(),
        description?.trim() || null,
        location?.trim() || null,
        event_date,
        allDay ? null : (start_time || null),
        allDay ? null : (end_time || null),
        allDay,
        req.user.id,
      ]
    );
    const event = ins.rows[0];

    // Si "todo el equipo" está marcado, invita a todos los que ya ingresaron.
    let attRows = [];
    if (allTeam) {
      ({ rows: attRows } = await client.query(`SELECT id, email FROM users WHERE email IS NOT NULL`));
    } else if (attendeeIds.length > 0) {
      ({ rows: attRows } = await client.query(
        `SELECT id, email FROM users WHERE id = ANY($1::int[])`,
        [attendeeIds]
      ));
    }
    for (const a of attRows) {
      await client.query(
        `INSERT INTO event_attendees (event_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [event.id, a.id]
      );
    }
    const attendeeEmails = attRows.map((a) => a.email);
    await client.query('COMMIT');

    // Sincronización con Google Calendar usando la cuenta del admin conectado.
    const adminG = await gcal.getAdminWithDrive();
    if (adminG) {
      try {
        const g = await gcal.createGoogleEvent(adminG, event, attendeeEmails);
        await db.query(
          `UPDATE events SET google_event_id = $1, google_html_link = $2 WHERE id = $3`,
          [g.id, g.htmlLink, event.id]
        );
        req.session.flash = { type: 'ok', text: 'Evento creado y enviado a Google Calendar.' };
      } catch (gErr) {
        console.error('Error al sincronizar con Google Calendar:', gErr.message);
        req.session.flash = {
          type: 'ok',
          text: 'Evento creado. (No se pudo sincronizar con Google Calendar en este momento.)',
        };
      }
    } else {
      req.session.flash = {
        type: 'ok',
        text: 'Evento creado. Para enviar invitaciones por mail, el administrador debe conectar Google Calendar.',
      };
    }

    res.redirect(`/events/${event.id}`);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
});

// ---------- Formulario de edición de evento ----------
router.get('/events/:id/edit', ensureAuth, ensureAdmin, async (req, res, next) => {
  try {
    const { rows } = await db.query('SELECT * FROM events WHERE id = $1', [req.params.id]);
    const event = rows[0];
    if (!event) {
      res.status(404);
      return res.render('error', { title: 'No encontrado', message: 'Ese evento no existe.' });
    }
    const { rows: users } = await db.query(
      `SELECT id, name, email FROM users WHERE role <> 'admin' OR id <> $1 ORDER BY name ASC`,
      [req.user.id]
    );
    const { rows: att } = await db.query(
      'SELECT user_id FROM event_attendees WHERE event_id = $1',
      [event.id]
    );
    res.render('event_form', {
      title: 'Editar evento',
      event,
      users,
      attendeeIds: att.map((a) => a.user_id),
      defaultDate: toInputDate(event.event_date),
      calendarConnected: gcal.hasCalendar(req.user),
    });
  } catch (err) {
    next(err);
  }
});

// ---------- Guardar edición de evento ----------
router.put('/events/:id', ensureAuth, ensureAdmin, async (req, res, next) => {
  const client = await db.pool.connect();
  try {
    const { title, description, location, event_date, start_time, end_time } = req.body;
    const allDay = req.body.all_day === 'on';
    const allTeam = req.body.all_team === 'on';
    const attendeeIds = toArray(req.body.attendees).map((x) => parseInt(x, 10)).filter(Boolean);

    if (!title || !title.trim() || !event_date) {
      req.session.flash = { type: 'error', text: 'El evento necesita título y fecha.' };
      return res.redirect(`/events/${req.params.id}/edit`);
    }

    await client.query('BEGIN');
    const upd = await client.query(
      `UPDATE events
          SET title = $1, description = $2, location = $3, event_date = $4,
              start_time = $5, end_time = $6, all_day = $7
        WHERE id = $8
        RETURNING *`,
      [
        title.trim(),
        description?.trim() || null,
        location?.trim() || null,
        event_date,
        allDay ? null : (start_time || null),
        allDay ? null : (end_time || null),
        allDay,
        req.params.id,
      ]
    );
    const event = upd.rows[0];
    if (!event) {
      await client.query('ROLLBACK');
      res.status(404);
      return res.render('error', { title: 'No encontrado', message: 'Ese evento no existe.' });
    }

    await client.query('DELETE FROM event_attendees WHERE event_id = $1', [event.id]);
    let attRows = [];
    if (allTeam) {
      ({ rows: attRows } = await client.query(`SELECT id, email FROM users WHERE email IS NOT NULL`));
    } else if (attendeeIds.length > 0) {
      ({ rows: attRows } = await client.query(
        `SELECT id, email FROM users WHERE id = ANY($1::int[])`,
        [attendeeIds]
      ));
    }
    for (const a of attRows) {
      await client.query(
        `INSERT INTO event_attendees (event_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [event.id, a.id]
      );
    }
    const attendeeEmails = attRows.map((a) => a.email);
    await client.query('COMMIT');

    const adminG = await gcal.getAdminWithDrive();
    if (adminG) {
      try {
        if (event.google_event_id) {
          await gcal.updateGoogleEvent(adminG, event.google_event_id, event, attendeeEmails);
        } else {
          const g = await gcal.createGoogleEvent(adminG, event, attendeeEmails);
          await db.query(
            `UPDATE events SET google_event_id = $1, google_html_link = $2 WHERE id = $3`,
            [g.id, g.htmlLink, event.id]
          );
        }
        req.session.flash = { type: 'ok', text: 'Evento actualizado y sincronizado con Google Calendar.' };
      } catch (gErr) {
        console.error('Error al actualizar en Google Calendar:', gErr.message);
        req.session.flash = { type: 'ok', text: 'Evento actualizado. (No se pudo sincronizar con Google Calendar.)' };
      }
    } else {
      req.session.flash = { type: 'ok', text: 'Evento actualizado.' };
    }

    res.redirect(`/events/${event.id}`);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
});

// ---------- Detalle de un evento ----------
router.get('/events/:id', ensureAuth, async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT e.*, u.name AS creator_name FROM events e
         LEFT JOIN users u ON u.id = e.created_by
        WHERE e.id = $1`,
      [req.params.id]
    );
    const event = rows[0];
    if (!event) {
      res.status(404);
      return res.render('error', { title: 'No encontrado', message: 'Ese evento no existe.' });
    }

    const { rows: attendees } = await db.query(
      `SELECT u.id, u.name, u.email FROM event_attendees ea
         JOIN users u ON u.id = ea.user_id
        WHERE ea.event_id = $1 ORDER BY u.name`,
      [event.id]
    );

    res.render('event_detail', {
      title: event.title,
      event,
      attendees,
      isAdmin: req.user.role === 'admin',
    });
  } catch (err) {
    next(err);
  }
});

// ---------- Borrar evento ----------
router.delete('/events/:id', ensureAuth, ensureAdmin, async (req, res, next) => {
  try {
    const { rows } = await db.query('SELECT * FROM events WHERE id = $1', [req.params.id]);
    const event = rows[0];
    if (!event) return res.redirect('/calendar');

    const adminG = await gcal.getAdminWithDrive();
    if (event.google_event_id && adminG) {
      try {
        await gcal.deleteGoogleEvent(adminG, event.google_event_id);
      } catch (gErr) {
        console.error('No se pudo borrar de Google Calendar:', gErr.message);
      }
    }
    await db.query('DELETE FROM events WHERE id = $1', [event.id]);
    req.session.flash = { type: 'ok', text: 'Evento eliminado.' };
    res.redirect('/calendar');
  } catch (err) {
    next(err);
  }
});

// ---------- Conectar Google Calendar (solo admin) ----------
router.get('/admin/calendar/connect', ensureAuth, ensureAdmin, (req, res) => {
  res.redirect(gcal.getConnectUrl());
});

router.get('/admin/calendar/callback', ensureAuth, ensureAdmin, async (req, res, next) => {
  try {
    if (req.query.error || !req.query.code) {
      req.session.flash = { type: 'error', text: 'No se conectó el calendario.' };
      return res.redirect('/calendar');
    }
    await gcal.saveTokensFromCode(req.user.id, req.query.code);
    req.session.flash = { type: 'ok', text: '¡Google conectado! (Calendar y Drive). Probá subir un archivo para confirmar Drive.' };
    res.redirect('/calendar');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
