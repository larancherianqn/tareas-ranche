const express = require('express');
const db = require('../db');
const { ensureAuth, ensureAdmin } = require('../middleware/auth');
const gdrive = require('../config/google');
const {
  uploadFiles, saveAttachments, attachmentFlash, attachmentsFor, deleteAttachmentsFor, deleteAttachment,
} = require('../config/attachments');
const {
  ANNOUNCEMENT_KINDS, REQUEST_KINDS, REQUEST_STATUSES,
} = require('../config/helpers');

const router = express.Router();

const VALID_ANN_KINDS = ANNOUNCEMENT_KINDS.map((k) => k.value);
const VALID_REQ_KINDS = REQUEST_KINDS.map((k) => k.value);
const VALID_REQ_STATUS = REQUEST_STATUSES.map((k) => k.value);

// ---------- Buzón (vista principal) ----------
router.get('/buzon', ensureAuth, async (req, res, next) => {
  try {
    const isAdmin = req.user.role === 'admin';

    const { rows: announcements } = await db.query(
      `SELECT a.*, u.name AS creator_name,
              (SELECT COUNT(*)::int FROM attachments at WHERE at.owner_type='announcement' AND at.owner_id=a.id) AS files
         FROM announcements a
         LEFT JOIN users u ON u.id = a.created_by
        ORDER BY a.created_at DESC`
    );

    let requests;
    if (isAdmin) {
      ({ rows: requests } = await db.query(
        `SELECT r.*, u.name AS requester_name,
                (SELECT COUNT(*)::int FROM attachments at WHERE at.owner_type='request' AND at.owner_id=r.id) AS files
           FROM requests r LEFT JOIN users u ON u.id = r.user_id
          ORDER BY CASE r.status WHEN 'pendiente' THEN 0 ELSE 1 END, r.created_at DESC`
      ));
    } else {
      ({ rows: requests } = await db.query(
        `SELECT r.*, u.name AS requester_name,
                (SELECT COUNT(*)::int FROM attachments at WHERE at.owner_type='request' AND at.owner_id=r.id) AS files
           FROM requests r LEFT JOIN users u ON u.id = r.user_id
          WHERE r.user_id = $1
          ORDER BY r.created_at DESC`,
        [req.user.id]
      ));
    }

    res.render('board', {
      title: 'Buzón',
      announcements,
      requests,
      isAdmin,
      googleConnected: gdrive.hasCalendar(req.user),
    });
  } catch (err) {
    next(err);
  }
});

// ---------- Avisos ----------
router.get('/avisos/new', ensureAuth, ensureAdmin, async (req, res, next) => {
  try {
    const { rows: types } = await db.query('SELECT name FROM announcement_types ORDER BY name');
    res.render('aviso_form', { title: 'Nuevo aviso', types });
  } catch (err) { next(err); }
});

router.post('/avisos', ensureAuth, ensureAdmin, uploadFiles, async (req, res, next) => {
  try {
    const { title, body, kind, ref_date } = req.body;
    if (!title || !title.trim()) {
      req.session.flash = { type: 'error', text: 'El aviso necesita un título.' };
      return res.redirect('/avisos/new');
    }
    const safeKind = (kind && kind.trim()) ? kind.trim() : 'Aviso';
    const { rows } = await db.query(
      `INSERT INTO announcements (title, body, kind, ref_date, created_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [title.trim(), body?.trim() || null, safeKind, ref_date || null, req.user.id]
    );
    const result = await saveAttachments('announcement', rows[0].id, req.files, req.user.id);
    req.session.flash = attachmentFlash('Aviso publicado.', result);
    res.redirect(`/avisos/${rows[0].id}`);
  } catch (err) {
    next(err);
  }
});

router.get('/avisos/:id', ensureAuth, async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT a.*, u.name AS creator_name FROM announcements a
         LEFT JOIN users u ON u.id = a.created_by WHERE a.id = $1`,
      [req.params.id]
    );
    const announcement = rows[0];
    if (!announcement) {
      res.status(404);
      return res.render('error', { title: 'No encontrado', message: 'Ese aviso no existe.' });
    }
    const files = await attachmentsFor('announcement', announcement.id);
    res.render('aviso_detail', {
      title: announcement.title,
      announcement,
      files,
      isAdmin: req.user.role === 'admin',
    });
  } catch (err) {
    next(err);
  }
});

router.delete('/avisos/:id', ensureAuth, ensureAdmin, async (req, res, next) => {
  try {
    await deleteAttachmentsFor('announcement', req.params.id);
    await db.query('DELETE FROM announcements WHERE id = $1', [req.params.id]);
    req.session.flash = { type: 'ok', text: 'Aviso eliminado.' };
    res.redirect('/buzon');
  } catch (err) {
    next(err);
  }
});

// ---------- Solicitudes ----------
router.get('/solicitudes/new', ensureAuth, async (req, res, next) => {
  try {
    const { rows: types } = await db.query('SELECT name FROM request_types ORDER BY name');
    res.render('solicitud_form', { title: 'Nueva solicitud', types });
  } catch (err) { next(err); }
});

router.post('/solicitudes', ensureAuth, uploadFiles, async (req, res, next) => {
  try {
    const { kind, start_date, end_date, reason } = req.body;
    const safeKind = (kind && kind.trim()) ? kind.trim() : 'Otro';
    const { rows } = await db.query(
      `INSERT INTO requests (user_id, kind, start_date, end_date, reason)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [req.user.id, safeKind, start_date || null, end_date || null, reason?.trim() || null]
    );
    const result = await saveAttachments('request', rows[0].id, req.files, req.user.id);
    req.session.flash = attachmentFlash('Solicitud enviada.', result);
    res.redirect(`/solicitudes/${rows[0].id}`);
  } catch (err) {
    next(err);
  }
});

router.get('/solicitudes/:id', ensureAuth, async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT r.*, u.name AS requester_name, u.email AS requester_email,
              rv.name AS reviewer_name
         FROM requests r
         LEFT JOIN users u ON u.id = r.user_id
         LEFT JOIN users rv ON rv.id = r.reviewed_by
        WHERE r.id = $1`,
      [req.params.id]
    );
    const request = rows[0];
    if (!request) {
      res.status(404);
      return res.render('error', { title: 'No encontrada', message: 'Esa solicitud no existe.' });
    }
    const isAdmin = req.user.role === 'admin';
    if (!isAdmin && request.user_id !== req.user.id) {
      res.status(403);
      return res.render('error', { title: 'Sin permiso', message: 'Esta solicitud no es tuya.' });
    }
    const files = await attachmentsFor('request', request.id);
    res.render('solicitud_detail', { title: 'Solicitud', request, files, isAdmin });
  } catch (err) {
    next(err);
  }
});

router.post('/solicitudes/:id/status', ensureAuth, ensureAdmin, async (req, res, next) => {
  try {
    const { status, admin_note } = req.body;
    if (!VALID_REQ_STATUS.includes(status)) {
      req.session.flash = { type: 'error', text: 'Estado inválido.' };
      return res.redirect(`/solicitudes/${req.params.id}`);
    }
    await db.query(
      `UPDATE requests SET status=$1, admin_note=$2, reviewed_by=$3, reviewed_at=now() WHERE id=$4`,
      [status, admin_note?.trim() || null, req.user.id, req.params.id]
    );
    req.session.flash = { type: 'ok', text: 'Solicitud actualizada.' };
    res.redirect(`/solicitudes/${req.params.id}`);
  } catch (err) {
    next(err);
  }
});

router.delete('/solicitudes/:id', ensureAuth, async (req, res, next) => {
  try {
    const { rows } = await db.query('SELECT user_id FROM requests WHERE id = $1', [req.params.id]);
    const request = rows[0];
    if (!request) return res.redirect('/buzon');
    if (req.user.role !== 'admin' && request.user_id !== req.user.id) {
      res.status(403);
      return res.render('error', { title: 'Sin permiso', message: 'Esta solicitud no es tuya.' });
    }
    await deleteAttachmentsFor('request', req.params.id);
    await db.query('DELETE FROM requests WHERE id = $1', [req.params.id]);
    req.session.flash = { type: 'ok', text: 'Solicitud eliminada.' };
    res.redirect('/buzon');
  } catch (err) {
    next(err);
  }
});

// ---------- Descarga de adjuntos ----------
router.get('/attachments/:id', ensureAuth, async (req, res, next) => {
  try {
    const { rows } = await db.query('SELECT * FROM attachments WHERE id = $1', [req.params.id]);
    const file = rows[0];
    if (!file) {
      res.status(404);
      return res.render('error', { title: 'No encontrado', message: 'Ese archivo no existe.' });
    }

    // Control de acceso: los avisos los ve todo el equipo; las solicitudes, solo dueño o admin.
    if (file.owner_type === 'request' && req.user.role !== 'admin') {
      const { rows: rq } = await db.query('SELECT user_id FROM requests WHERE id = $1', [file.owner_id]);
      if (!rq[0] || rq[0].user_id !== req.user.id) {
        res.status(403);
        return res.render('error', { title: 'Sin permiso', message: 'No podés ver este archivo.' });
      }
    }
    // Fotos de tareas: solo el admin o quien tenga la tarea (por persona o sector).
    if (file.owner_type === 'task' && req.user.role !== 'admin') {
      const { rows: tk } = await db.query('SELECT assigned_to, sector_id FROM tasks WHERE id = $1', [file.owner_id]);
      const t = tk[0];
      const allowed = t && (t.assigned_to === req.user.id || (t.sector_id && t.sector_id === req.user.sector_id));
      if (!allowed) {
        res.status(403);
        return res.render('error', { title: 'Sin permiso', message: 'No podés ver este archivo.' });
      }
    }

    const admin = await gdrive.getAdminWithDrive();
    if (!admin || !file.drive_file_id) {
      res.status(404);
      return res.render('error', { title: 'No disponible', message: 'El archivo no está disponible en este momento.' });
    }

    const inlineTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/gif', 'image/webp'];
    const disposition = inlineTypes.includes(file.mime_type) ? 'inline' : 'attachment';
    res.setHeader('Content-Type', file.mime_type || 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `${disposition}; filename="${encodeURIComponent(file.filename)}"`
    );

    const stream = await gdrive.getDriveFileStream(admin, file.drive_file_id);
    stream.on('error', (err) => {
      console.error('Error al leer de Drive:', err.message);
      if (!res.headersSent) res.status(502);
      res.end();
    });
    stream.pipe(res);
  } catch (err) {
    next(err);
  }
});

// ---------- Borrar un adjunto puntual ----------
router.delete('/attachments/:id', ensureAuth, async (req, res, next) => {
  try {
    const { rows } = await db.query('SELECT * FROM attachments WHERE id = $1', [req.params.id]);
    const file = rows[0];
    if (!file) return res.redirect('back');

    const isAdmin = req.user.role === 'admin';
    let allowed = isAdmin;
    if (!isAdmin && file.owner_type === 'request') {
      const { rows: rq } = await db.query('SELECT user_id FROM requests WHERE id = $1', [file.owner_id]);
      allowed = rq[0] && rq[0].user_id === req.user.id;
    }
    if (!allowed) {
      res.status(403);
      return res.render('error', { title: 'Sin permiso', message: 'No podés borrar este archivo.' });
    }

    await deleteAttachment(file.id);
    req.session.flash = { type: 'ok', text: 'Archivo eliminado.' };
    res.redirect('back');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
