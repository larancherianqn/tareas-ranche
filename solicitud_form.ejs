// Exige estar logueado.
function ensureAuth(req, res, next) {
  if (req.isAuthenticated && req.isAuthenticated()) return next();
  req.session.flash = { type: 'error', text: 'Tenés que iniciar sesión.' };
  return res.redirect('/login');
}

// Exige rol admin.
function ensureAdmin(req, res, next) {
  if (req.isAuthenticated && req.isAuthenticated() && req.user.role === 'admin') {
    return next();
  }
  res.status(403);
  return res.render('error', {
    title: 'Sin permiso',
    message: 'Esta sección es solo para el administrador.',
  });
}

module.exports = { ensureAuth, ensureAdmin };
