// Esquema de la base de datos embebido en el código (no depende de archivos sueltos).
// Se ejecuta al iniciar el servidor; es idempotente (CREATE ... IF NOT EXISTS).
module.exports = `
-- Esquema de la base de datos. Se ejecuta solo al iniciar el servidor.
-- Usa "IF NOT EXISTS" para que sea seguro correrlo muchas veces.

-- Tabla de sesiones (la usa connect-pg-simple para guardar los logins).
CREATE TABLE IF NOT EXISTS "session" (
  "sid"    varchar NOT NULL COLLATE "default",
  "sess"   json NOT NULL,
  "expire" timestamp(6) NOT NULL,
  CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
);
CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");

-- Usuarios que efectivamente entraron alguna vez con Google.
CREATE TABLE IF NOT EXISTS users (
  id         SERIAL PRIMARY KEY,
  google_id  TEXT UNIQUE,
  email      TEXT UNIQUE NOT NULL,
  name       TEXT,
  role       TEXT NOT NULL DEFAULT 'empleado',  -- 'admin' o 'empleado'
  google_access_token  TEXT,
  google_refresh_token TEXT,
  google_token_expiry  TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Lista blanca: correos que el admin autoriza a entrar.
CREATE TABLE IF NOT EXISTS authorized_emails (
  id         SERIAL PRIMARY KEY,
  email      TEXT UNIQUE NOT NULL,
  name       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tareas.
CREATE TABLE IF NOT EXISTS tasks (
  id          SERIAL PRIMARY KEY,
  title       TEXT NOT NULL,
  description TEXT,
  assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  due_date    DATE,
  status      TEXT NOT NULL DEFAULT 'pendiente',  -- 'pendiente', 'en_curso', 'hecha'
  category    TEXT,  -- 'mantenimiento','limpieza','administrativa','operativa','diaria'
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Historial de avances: cada vez que alguien actualiza una tarea
-- queda registrado el cambio de estado y la observación.
CREATE TABLE IF NOT EXISTS task_updates (
  id         SERIAL PRIMARY KEY,
  task_id    INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  status     TEXT,
  note       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON tasks (assigned_to);
CREATE INDEX IF NOT EXISTS idx_task_updates_task_id ON task_updates (task_id);

-- Eventos del calendario.
CREATE TABLE IF NOT EXISTS events (
  id              SERIAL PRIMARY KEY,
  title           TEXT NOT NULL,
  description     TEXT,
  location        TEXT,
  event_date      DATE NOT NULL,
  start_time      TEXT,   -- 'HH:MM' (null si es de día completo)
  end_time        TEXT,   -- 'HH:MM'
  all_day         BOOLEAN NOT NULL DEFAULT false,
  created_by      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  google_event_id TEXT,   -- id del evento en Google Calendar (si se sincronizó)
  google_html_link TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Invitados a cada evento.
CREATE TABLE IF NOT EXISTS event_attendees (
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (event_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_events_date ON events (event_date);

-- Avisos del administrador hacia el equipo.
CREATE TABLE IF NOT EXISTS announcements (
  id         SERIAL PRIMARY KEY,
  title      TEXT NOT NULL,
  body       TEXT,
  kind       TEXT NOT NULL DEFAULT 'aviso',  -- 'aviso','cronograma','dia_no_laborable'
  ref_date   DATE,  -- fecha relacionada (ej: el día que no se trabaja)
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Solicitudes de los empleados hacia el administrador.
CREATE TABLE IF NOT EXISTS requests (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  kind        TEXT NOT NULL DEFAULT 'otro',  -- 'enfermedad','vacaciones','personal','otro'
  start_date  DATE,
  end_date    DATE,
  reason      TEXT,
  status      TEXT NOT NULL DEFAULT 'pendiente',  -- 'pendiente','aprobada','rechazada'
  admin_note  TEXT,
  reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Archivos adjuntos. El contenido vive en Google Drive; acá guardamos solo la referencia.
CREATE TABLE IF NOT EXISTS attachments (
  id            SERIAL PRIMARY KEY,
  owner_type    TEXT NOT NULL,   -- 'announcement' o 'request'
  owner_id      INTEGER NOT NULL,
  filename      TEXT NOT NULL,
  mime_type     TEXT,
  size_bytes    INTEGER,
  drive_file_id TEXT,            -- id del archivo en Google Drive
  uploaded_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ajustes generales de la app (ej: id de la carpeta raíz en Drive).
CREATE TABLE IF NOT EXISTS app_settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);

-- Sectores / áreas responsables (los define el administrador).
CREATE TABLE IF NOT EXISTS sectors (
  id         SERIAL PRIMARY KEY,
  name       TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Roster de empleados (legajos). Independiente de las cuentas de login.
CREATE TABLE IF NOT EXISTS employees (
  id              SERIAL PRIMARY KEY,
  name            TEXT NOT NULL,
  email           TEXT,
  sector_id       INTEGER REFERENCES sectors(id) ON DELETE SET NULL,
  drive_folder_id TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tipos de aviso y de solicitud (configurables desde Equipo).
CREATE TABLE IF NOT EXISTS announcement_types (
  id   SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL
);
CREATE TABLE IF NOT EXISTS request_types (
  id   SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL
);
INSERT INTO announcement_types (name) VALUES ('Aviso'), ('Cronograma'), ('Día no laborable')
  ON CONFLICT (name) DO NOTHING;
INSERT INTO request_types (name) VALUES ('Licencia por enfermedad'), ('Vacaciones'), ('Día personal'), ('Otro')
  ON CONFLICT (name) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_requests_user ON requests (user_id);
CREATE INDEX IF NOT EXISTS idx_attachments_owner ON attachments (owner_type, owner_id);

-- Migraciones seguras para bases ya creadas en versiones anteriores.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_access_token TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_refresh_token TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_token_expiry TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS sector_id INTEGER REFERENCES sectors(id) ON DELETE SET NULL;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS sector_id INTEGER REFERENCES sectors(id) ON DELETE SET NULL;
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS target_employee_id INTEGER REFERENCES employees(id) ON DELETE SET NULL;
ALTER TABLE requests ADD COLUMN IF NOT EXISTS employee_id INTEGER REFERENCES employees(id) ON DELETE SET NULL;
`;
