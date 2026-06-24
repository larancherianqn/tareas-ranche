const express = require('express');
const db = require('../db');
const { ensureAuth, ensureAdmin } = require('../middleware/auth');
const { STATUSES, CATEGORIES } = require('../config/helpers');
const {
  uploadFiles, saveAttachments, attachmentsFor, deleteAttachmentsFor, attachmentFlash,
} = require('../config/attachments');

const router = express.Router();
const VALID_STATUSES = STATUSES.map((s) => s.value);
const VALID_CATEGORIES = CATEGORIES.map((c) => c.value);

// Todas las rutas de tareas requieren sesión.
router.use(ensureAuth);

// Dashboard / listado.
// Admin ve todas las tareas; empleado solo las propias.
router.get('/', async (req, res, next) => {
  try {
    const isAdmin = req.user.role === 'admin';
    const filter = req.query.estado; // opcional: filtra por estado
    const catFilter = req.query.categoria; // opcional: filtra por tipo
    const sectorFilter = req.query.sector ? parseInt(req.query.sector, 10) : null;

    const params = [];
    const where = [];

    // Alcance: el admin ve todo; el empleado ve lo suyo, lo de su sector y lo que creó.
    if (!isAdmin) {
      if (req.user.sector_id) {
        params.push(req.user.id, req.user.sector_id);
        where.push(`(t.assigned_to = $${params.length - 1} OR t.created_by = $${params.length - 1} OR t.sector_id = $${params.length})`);
      } else {
        params.push(req.user.id);
        where.push(`(t.assigned_to = $${params.length} OR t.created_by = $${params.length})`);
      }
    }
    if (filter && VALID_STATUSES.includes(filter)) {
      params.push(filter);
      where.push(`t.status = $${params.length}`);
    }
    if (catFilter && VALID_CATEGORIES.includes(catFilter)) {
      params.push(catFilter);
      where.push(`t.category = $${params.length}`);
    }
    if (sectorFilter) {
      params.push(sectorFilter);
      where.push(`t.sector_id = $${params.length}`);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const { rows: tasks } = await db.query(
      `SELECT t.*, u.name AS assignee_name, u.email AS assignee_email, s.name AS sector_name,
              (SELECT COUNT(*)::int FROM attachments at WHERE at.owner_type='task' AND at.owner_id=t.id) AS photos
         FROM tasks t
         LEFT JOIN users u ON u.id = t.assigned_to
         LEFT JOIN sectors s ON s.id = t.sector_id
         ${whereSql}
         ORDER BY
           CASE t.status WHEN 'pendiente' THEN 0 WHEN 'en_curso' THEN 1 ELSE 2 END,
           t.due_date ASC NULLS LAST,
           t.created_at DESC`,
      params
    );

    // Conteo por estado, respetando el alcance del usuario.
    const scopeParams = [];
    let scopeWhere = '';
    if (!isAdmin) {
      if (req.user.sector_id) {
        scopeParams.push(req.user.id, req.user.sector_id);
        scopeWhere = 'WHERE (assigned_to = $1 OR created_by = $1 OR sector_id = $2)';
      } else {
        scopeParams.push(req.user.id);
        scopeWhere = 'WHERE (assigned_to = $1 OR created_by = $1)';
      }
    }
    const { rows: counts } = await db.query(
      `SELECT status, COUNT(*)::int AS n FROM tasks ${scopeWhere} GROUP BY status`,
      scopeParams
    );
    const countByStatus = { pendiente: 0, en_curso: 0, hecha: 0 };
    counts.forEach((c) => { countByStatus[c.status] = c.n; });

    // Lista de sectores para el filtro (solo lo usa el admin).
    const { rows: sectors } = await db.query('SELECT id, name FROM sectors ORDER BY name');

    res.render('dashboard', {
      title: 'Tareas',
      tasks,
      countByStatus,
      activeFilter: filter && VALID_STATUSES.includes(filter) ? filter : null,
      activeCategory: catFilter && VALID_CATEGORIES.includes(catFilter) ? catFilter : null,
      activeSector: sectorFilter,
      sectors,
      isAdmin,
    });
  } catch (err) {
    next(err);
  }
});

// Formulario de nueva tarea (solo admin).
router.get('/tasks/new', ensureAuth, async (req, res, next) => {
  try {
    const { rows: users } = await db.query(
      `SELECT id, name, email FROM users ORDER BY name ASC`
    );
    const { rows: sectors } = await db.query('SELECT id, name FROM sectors ORDER BY name');
    res.render('task_form', { title: 'Nueva tarea', task: null, users, sectors, files: [] });
  } catch (err) {
    next(err);
  }
});

// Crear tarea (solo admin).
router.post('/tasks', ensureAuth, uploadFiles, async (req, res, next) => {
  try {
    const { title, description, assigned_to, due_date, status, category, sector_id } = req.body;
    if (!title || !title.trim()) {
      req.session.flash = { type: 'error', text: 'La tarea necesita un título.' };
      return res.redirect('/tasks/new');
    }
    const safeStatus = VALID_STATUSES.includes(status) ? status : 'pendiente';
    const safeCategory = VALID_CATEGORIES.includes(category) ? category : null;
    const safeSector = sector_id && !Number.isNaN(parseInt(sector_id, 10)) ? parseInt(sector_id, 10) : null;

    const { rows } = await db.query(
      `INSERT INTO tasks (title, description, assigned_to, created_by, due_date, status, category, sector_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [
        title.trim(),
        description?.trim() || null,
        assigned_to || null,
        req.user.id,
        due_date || null,
        safeStatus,
        safeCategory,
        safeSector,
      ]
    );

    // Registramos el primer movimiento en el historial.
    await db.query(
      `INSERT INTO task_updates (task_id, user_id, status, note)
       VALUES ($1, $2, $3, $4)`,
      [rows[0].id, req.user.id, safeStatus, 'Tarea creada.']
    );

    const att = await saveAttachments('task', rows[0].id, req.files, req.user.id, ['Tareas']);
    req.session.flash = attachmentFlash('Tarea creada.', att);
    res.redirect(`/tasks/${rows[0].id}`);
  } catch (err) {
    next(err);
  }
});

// Detalle de una tarea.
router.get('/tasks/:id', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT t.*, u.name AS assignee_name, u.email AS assignee_email,
              c.name AS creator_name, s.name AS sector_name
         FROM tasks t
         LEFT JOIN users u ON u.id = t.assigned_to
         LEFT JOIN users c ON c.id = t.created_by
         LEFT JOIN sectors s ON s.id = t.sector_id
        WHERE t.id = $1`,
      [req.params.id]
    );
    const task = rows[0];
    if (!task) {
      res.status(404);
      return res.render('error', { title: 'No encontrada', message: 'Esa tarea no existe.' });
    }

    // Un empleado puede ver la tarea si es suya o es de su sector.
    const ownsOrSector = task.assigned_to === req.user.id || task.created_by === req.user.id
      || (task.sector_id && task.sector_id === req.user.sector_id);
    if (req.user.role !== 'admin' && !ownsOrSector) {
      res.status(403);
      return res.render('error', { title: 'Sin permiso', message: 'Esta tarea no es de tu sector.' });
    }

    const { rows: updates } = await db.query(
      `SELECT tu.*, u.name AS author_name
         FROM task_updates tu
         LEFT JOIN users u ON u.id = tu.user_id
        WHERE tu.task_id = $1
        ORDER BY tu.created_at DESC`,
      [task.id]
    );

    const files = await attachmentsFor('task', task.id);

    res.render('task_detail', {
      title: task.title,
      task,
      updates,
      files,
      isAdmin: req.user.role === 'admin',
    });
  } catch (err) {
    next(err);
  }
});

// Registrar un avance (cambio de estado + observación).
// El empleado puede hacerlo en sus tareas; el admin en cualquiera.
router.post('/tasks/:id/update', async (req, res, next) => {
  try {
    const { rows } = await db.query('SELECT * FROM tasks WHERE id = $1', [req.params.id]);
    const task = rows[0];
    if (!task) {
      res.status(404);
      return res.render('error', { title: 'No encontrada', message: 'Esa tarea no existe.' });
    }
    const ownsOrSector = task.assigned_to === req.user.id || task.created_by === req.user.id
      || (task.sector_id && task.sector_id === req.user.sector_id);
    if (req.user.role !== 'admin' && !ownsOrSector) {
      res.status(403);
      return res.render('error', { title: 'Sin permiso', message: 'Esta tarea no es de tu sector.' });
    }

    const { status, note } = req.body;
    const newStatus = VALID_STATUSES.includes(status) ? status : task.status;
    const cleanNote = note?.trim() || null;

    if (newStatus === task.status && !cleanNote) {
      req.session.flash = { type: 'error', text: 'Cambiá el estado o escribí una observación.' };
      return res.redirect(`/tasks/${task.id}`);
    }

    await db.query(
      `UPDATE tasks SET status = $1, updated_at = now() WHERE id = $2`,
      [newStatus, task.id]
    );
    await db.query(
      `INSERT INTO task_updates (task_id, user_id, status, note)
       VALUES ($1, $2, $3, $4)`,
      [task.id, req.user.id, newStatus, cleanNote]
    );

    req.session.flash = { type: 'ok', text: 'Avance registrado.' };
    res.redirect(`/tasks/${task.id}`);
  } catch (err) {
    next(err);
  }
});

// Formulario de edición (solo admin).
router.get('/tasks/:id/edit', ensureAdmin, async (req, res, next) => {
  try {
    const { rows } = await db.query('SELECT * FROM tasks WHERE id = $1', [req.params.id]);
    const task = rows[0];
    if (!task) {
      res.status(404);
      return res.render('error', { title: 'No encontrada', message: 'Esa tarea no existe.' });
    }
    const { rows: users } = await db.query(
      `SELECT id, name, email FROM users ORDER BY name ASC`
    );
    const { rows: sectors } = await db.query('SELECT id, name FROM sectors ORDER BY name');
    const files = await attachmentsFor('task', task.id);
    res.render('task_form', { title: 'Editar tarea', task, users, sectors, files });
  } catch (err) {
    next(err);
  }
});

// Guardar edición (solo admin).
router.put('/tasks/:id', ensureAdmin, uploadFiles, async (req, res, next) => {
  try {
    const { title, description, assigned_to, due_date, status, category, sector_id } = req.body;
    if (!title || !title.trim()) {
      req.session.flash = { type: 'error', text: 'La tarea necesita un título.' };
      return res.redirect(`/tasks/${req.params.id}/edit`);
    }
    const safeStatus = VALID_STATUSES.includes(status) ? status : 'pendiente';
    const safeCategory = VALID_CATEGORIES.includes(category) ? category : null;
    const safeSector = sector_id && !Number.isNaN(parseInt(sector_id, 10)) ? parseInt(sector_id, 10) : null;

    await db.query(
      `UPDATE tasks
          SET title = $1, description = $2, assigned_to = $3, due_date = $4,
              status = $5, category = $6, sector_id = $7, updated_at = now()
        WHERE id = $8`,
      [
        title.trim(),
        description?.trim() || null,
        assigned_to || null,
        due_date || null,
        safeStatus,
        safeCategory,
        safeSector,
        req.params.id,
      ]
    );

    const att = await saveAttachments('task', req.params.id, req.files, req.user.id, ['Tareas']);
    req.session.flash = attachmentFlash('Tarea actualizada.', att);
    res.redirect(`/tasks/${req.params.id}`);
  } catch (err) {
    next(err);
  }
});

// Borrar tarea (solo admin).
router.delete('/tasks/:id', ensureAdmin, async (req, res, next) => {
  try {
    await deleteAttachmentsFor('task', req.params.id);
    await db.query('DELETE FROM tasks WHERE id = $1', [req.params.id]);
    req.session.flash = { type: 'ok', text: 'Tarea eliminada.' };
    res.redirect('/');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
