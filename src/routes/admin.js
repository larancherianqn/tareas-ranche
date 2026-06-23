const express = require('express');
const db = require('../db');
const { ensureAuth, ensureAdmin } = require('../middleware/auth');

const router = express.Router();

router.use(ensureAuth, ensureAdmin);

// Lista de correos autorizados + quiénes ya entraron.
router.get('/admin/users', async (req, res, next) => {
  try {
    const { rows: authorized } = await db.query(
      `SELECT a.*, u.id AS user_id, u.role, u.name AS user_name, u.sector_id,
              s.name AS sector_name
         FROM authorized_emails a
         LEFT JOIN users u ON u.email = a.email
         LEFT JOIN sectors s ON s.id = u.sector_id
        ORDER BY a.created_at DESC`
    );
    const { rows: admins } = await db.query(
      `SELECT email, name FROM users WHERE role = 'admin' ORDER BY email`
    );
    const { rows: sectors } = await db.query(
      `SELECT s.*, (SELECT COUNT(*)::int FROM users u WHERE u.sector_id = s.id) AS members
         FROM sectors s ORDER BY s.name`
    );
    res.render('admin_users', { title: 'Equipo', authorized, admins, sectors });
  } catch (err) {
    next(err);
  }
});

// Crear un sector.
router.post('/admin/sectors', async (req, res, next) => {
  try {
    const name = (req.body.name || '').trim();
    if (!name) {
      req.session.flash = { type: 'error', text: 'Poné un nombre para el sector.' };
      return res.redirect('/admin/users');
    }
    await db.query(
      `INSERT INTO sectors (name) VALUES ($1) ON CONFLICT (name) DO NOTHING`,
      [name]
    );
    req.session.flash = { type: 'ok', text: `Sector "${name}" creado.` };
    res.redirect('/admin/users');
  } catch (err) {
    next(err);
  }
});

// Borrar un sector (las tareas/usuarios quedan sin sector).
router.delete('/admin/sectors/:id', async (req, res, next) => {
  try {
    await db.query('DELETE FROM sectors WHERE id = $1', [req.params.id]);
    req.session.flash = { type: 'ok', text: 'Sector eliminado.' };
    res.redirect('/admin/users');
  } catch (err) {
    next(err);
  }
});

// Asignar (o quitar) el sector de un usuario.
router.post('/admin/users/:id/sector', async (req, res, next) => {
  try {
    const sectorId = req.body.sector_id && !Number.isNaN(parseInt(req.body.sector_id, 10))
      ? parseInt(req.body.sector_id, 10) : null;
    await db.query('UPDATE users SET sector_id = $1 WHERE id = $2', [sectorId, req.params.id]);
    req.session.flash = { type: 'ok', text: 'Sector actualizado.' };
    res.redirect('/admin/users');
  } catch (err) {
    next(err);
  }
});

// Autorizar un correo nuevo.
router.post('/admin/users', async (req, res, next) => {
  try {
    const email = (req.body.email || '').toLowerCase().trim();
    const name = (req.body.name || '').trim() || null;

    if (!email || !email.includes('@')) {
      req.session.flash = { type: 'error', text: 'Escribí un correo válido.' };
      return res.redirect('/admin/users');
    }

    await db.query(
      `INSERT INTO authorized_emails (email, name)
       VALUES ($1, $2)
       ON CONFLICT (email) DO NOTHING`,
      [email, name]
    );

    req.session.flash = { type: 'ok', text: `${email} autorizado.` };
    res.redirect('/admin/users');
  } catch (err) {
    next(err);
  }
});

// Quitar autorización. (No borra al usuario ni sus tareas, solo le impide volver a entrar.)
router.delete('/admin/users/:id', async (req, res, next) => {
  try {
    await db.query('DELETE FROM authorized_emails WHERE id = $1', [req.params.id]);
    req.session.flash = { type: 'ok', text: 'Autorización quitada.' };
    res.redirect('/admin/users');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
