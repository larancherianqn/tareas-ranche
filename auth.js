const passport = require('passport');
const { Strategy: GoogleStrategy } = require('passport-google-oauth20');
const db = require('../db');

// Guardamos en la sesión solo el id del usuario.
passport.serializeUser((user, done) => done(null, user.id));

passport.deserializeUser(async (id, done) => {
  try {
    const { rows } = await db.query('SELECT * FROM users WHERE id = $1', [id]);
    done(null, rows[0] || false);
  } catch (err) {
    done(err);
  }
});

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: `${process.env.BASE_URL}/auth/google/callback`,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const email = (profile.emails?.[0]?.value || '').toLowerCase().trim();
        const name = profile.displayName || email;
        const googleId = profile.id;

        if (!email) {
          return done(null, false, { message: 'No pudimos leer tu correo de Google.' });
        }

        const adminEmail = (process.env.ADMIN_EMAIL || '').toLowerCase().trim();
        const isAdmin = email === adminEmail;

        // Si no es el admin, tiene que estar en la lista de correos autorizados.
        if (!isAdmin) {
          const authorized = await db.query(
            'SELECT 1 FROM authorized_emails WHERE email = $1',
            [email]
          );
          if (authorized.rowCount === 0) {
            return done(null, false, {
              message: 'Tu correo no está autorizado. Pedile al administrador que te agregue.',
            });
          }
        }

        // Buscamos al usuario; si no existe, lo creamos.
        const existing = await db.query('SELECT * FROM users WHERE email = $1', [email]);
        let user;

        if (existing.rowCount > 0) {
          // Actualizamos datos básicos y nos aseguramos del rol correcto.
          const updated = await db.query(
            `UPDATE users
               SET google_id = $1, name = $2, role = $3
             WHERE email = $4
             RETURNING *`,
            [googleId, name, isAdmin ? 'admin' : existing.rows[0].role || 'empleado', email]
          );
          user = updated.rows[0];
        } else {
          const inserted = await db.query(
            `INSERT INTO users (google_id, email, name, role)
             VALUES ($1, $2, $3, $4)
             RETURNING *`,
            [googleId, email, name, isAdmin ? 'admin' : 'empleado']
          );
          user = inserted.rows[0];
        }

        return done(null, user);
      } catch (err) {
        return done(err);
      }
    }
  )
);

module.exports = passport;
