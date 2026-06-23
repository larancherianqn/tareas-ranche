const express = require('express');
const passport = require('passport');

const router = express.Router();

// Pantalla de login.
router.get('/login', (req, res) => {
  if (req.isAuthenticated && req.isAuthenticated()) return res.redirect('/');
  res.render('login', { title: 'Ingresar' });
});

// Inicia el flujo de Google.
router.get(
  '/auth/google',
  passport.authenticate('google', { scope: ['profile', 'email'], prompt: 'select_account' })
);

// Vuelta de Google.
router.get('/auth/google/callback', (req, res, next) => {
  passport.authenticate('google', (err, user, info) => {
    if (err) return next(err);
    if (!user) {
      req.session.flash = {
        type: 'error',
        text: (info && info.message) || 'No pudimos iniciar sesión.',
      };
      return res.redirect('/login');
    }
    req.logIn(user, (loginErr) => {
      if (loginErr) return next(loginErr);
      return res.redirect('/');
    });
  })(req, res, next);
});

// Cerrar sesión.
router.post('/logout', (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err);
    res.redirect('/login');
  });
});

module.exports = router;
