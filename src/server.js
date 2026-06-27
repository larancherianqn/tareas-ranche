require('dotenv').config();

const path = require('path');
const express = require('express');
const session = require('express-session');
const methodOverride = require('method-override');
const pgSession = require('connect-pg-simple')(session);

const db = require('./db');
const passport = require('./config/passport');
const helpers = require('./config/helpers');

const authRoutes = require('./routes/auth');
const taskRoutes = require('./routes/tasks');
const adminRoutes = require('./routes/admin');
const eventRoutes = require('./routes/events');
const boardRoutes = require('./routes/board');

const app = express();
const PORT = process.env.PORT || 3000;

// Render corre detrás de un proxy; esto hace que las cookies "secure" funcionen.
app.set('trust proxy', 1);

// Vistas EJS.
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Archivos estáticos (CSS).
app.use(express.static(path.join(__dirname, 'public')));

// Lectura de formularios y soporte para PUT/DELETE desde formularios HTML.
app.use(express.urlencoded({ extended: true }));
// Permite usar PUT/DELETE desde formularios HTML (que solo soportan GET/POST).
app.use(
  methodOverride((req) => {
    if (req.body && typeof req.body === 'object' && '_method' in req.body) {
      const method = req.body._method;
      delete req.body._method;
      return method;
    }
    if (req.query && req.query._method) return req.query._method;
    return undefined;
  })
);

// Sesión guardada en Postgres.
app.use(
  session({
    store: new pgSession({ pool: db.pool, tableName: 'session' }),
    secret: process.env.SESSION_SECRET || 'cambia-esto',
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 días
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
    },
  })
);

app.use(passport.initialize());
app.use(passport.session());

// Variables disponibles en todas las vistas.
app.use(async (req, res, next) => {
  res.locals.currentUser = req.user || null;
  res.locals.flash = req.session.flash || null;
  delete req.session.flash;
  res.locals.h = helpers; // helpers de formato/etiquetas
  res.locals.path = req.path;
  res.locals.appVersion = 'v11 · notificaciones de avisos';
  res.locals.unreadAvisos = 0;
  if (req.user) {
    try {
      const { rows } = await db.query(
        `SELECT COUNT(*)::int AS n FROM announcements
          WHERE created_by <> $1
            AND ($2::timestamptz IS NULL OR created_at > $2)`,
        [req.user.id, req.user.buzon_seen_at || null]
      );
      res.locals.unreadAvisos = rows[0] ? rows[0].n : 0;
    } catch (e) {
      res.locals.unreadAvisos = 0;
    }
  }
  next();
});

// Rutas.
app.use('/', authRoutes);
app.use('/', taskRoutes);
app.use('/', adminRoutes);
app.use('/', eventRoutes);
app.use('/', boardRoutes);

// 404.
app.use((req, res) => {
  res.status(404).render('error', { title: 'No encontrado', message: 'Esta página no existe.' });
});

// Manejo de errores.
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).render('error', {
    title: 'Error',
    message: 'Algo salió mal. Probá de nuevo en un momento.',
  });
});

// Arranque: primero prepara la base, después escucha.
db.initSchema()
  .then(() => {
    app.listen(PORT, () => console.log(`Servidor en puerto ${PORT}`));
  })
  .catch((err) => {
    console.error('No se pudo inicializar la base de datos:', err);
    process.exit(1);
  });
