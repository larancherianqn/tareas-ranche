const { google } = require('googleapis');
const db = require('../db');

// Zona horaria para interpretar los horarios de los eventos.
const TIMEZONE = process.env.APP_TIMEZONE || 'America/Argentina/Buenos_Aires';

// Permiso necesario para crear/editar eventos en el calendario del admin.
const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events';
// Permiso de Drive: solo los archivos que crea la propia app.
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

// URL a la que Google vuelve después de que el admin conecta su cuenta.
function calendarRedirectUri() {
  return `${process.env.BASE_URL}/admin/calendar/callback`;
}

// Crea un cliente OAuth2 nuevo.
function buildOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    calendarRedirectUri()
  );
}

// URL para que el admin autorice Calendar y Drive.
function getConnectUrl() {
  const client = buildOAuthClient();
  return client.generateAuthUrl({
    access_type: 'offline', // para recibir refresh_token
    prompt: 'consent', // fuerza a entregar el refresh_token
    scope: [CALENDAR_SCOPE, DRIVE_SCOPE],
  });
}

// Intercambia el "code" por tokens y los guarda en el usuario.
async function saveTokensFromCode(userId, code) {
  const client = buildOAuthClient();
  const { tokens } = await client.getToken(code);

  await db.query(
    `UPDATE users
        SET google_access_token = $1,
            google_refresh_token = COALESCE($2, google_refresh_token),
            google_token_expiry = $3
      WHERE id = $4`,
    [
      tokens.access_token || null,
      tokens.refresh_token || null,
      tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      userId,
    ]
  );
}

// Devuelve true si el usuario ya conectó su calendario.
function hasCalendar(user) {
  return !!(user && user.google_refresh_token);
}

// Construye un cliente OAuth2 con los tokens del usuario y persiste las renovaciones.
function clientForUser(user) {
  const client = buildOAuthClient();
  client.setCredentials({
    access_token: user.google_access_token || undefined,
    refresh_token: user.google_refresh_token || undefined,
    expiry_date: user.google_token_expiry ? new Date(user.google_token_expiry).getTime() : undefined,
  });
  client.on('tokens', (tokens) => {
    db.query(
      `UPDATE users
          SET google_access_token = COALESCE($1, google_access_token),
              google_refresh_token = COALESCE($2, google_refresh_token),
              google_token_expiry = COALESCE($3, google_token_expiry)
        WHERE id = $4`,
      [
        tokens.access_token || null,
        tokens.refresh_token || null,
        tokens.expiry_date ? new Date(tokens.expiry_date) : null,
        user.id,
      ]
    ).catch((err) => console.error('No se pudieron guardar los tokens renovados:', err));
  });
  return client;
}

// Devuelve un cliente de Calendar listo para usar con los tokens del usuario.
function getCalendarForUser(user) {
  return google.calendar({ version: 'v3', auth: clientForUser(user) });
}

// --- Google Drive ---

const { Readable } = require('stream');

// Devuelve el admin que tenga la cuenta de Google conectada (con su refresh token).
async function getAdminWithDrive() {
  const { rows } = await db.query(
    `SELECT * FROM users
      WHERE role = 'admin' AND google_refresh_token IS NOT NULL
      ORDER BY id LIMIT 1`
  );
  return rows[0] || null;
}

// Lee/guarda un ajuste simple.
async function getSetting(key) {
  const { rows } = await db.query('SELECT value FROM app_settings WHERE key = $1', [key]);
  return rows[0] ? rows[0].value : null;
}
async function setSetting(key, value) {
  await db.query(
    `INSERT INTO app_settings (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [key, value]
  );
}

// Busca una carpeta por nombre dentro de un padre; si no existe, la crea.
async function getOrCreateFolder(drive, name, parentId) {
  const safeName = name.replace(/'/g, "\\'");
  const q = `mimeType='application/vnd.google-apps.folder' and name='${safeName}' and trashed=false and '${parentId}' in parents`;
  const list = await drive.files.list({ q, fields: 'files(id,name)', spaces: 'drive' });
  if (list.data.files && list.data.files.length) return list.data.files[0].id;
  const created = await drive.files.create({
    requestBody: { name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] },
    fields: 'id',
  });
  return created.data.id;
}

// Nombre de la carpeta del mes, ej: "2026-06 Junio".
function monthFolderName(date) {
  const d = date || new Date();
  const mes = d.toLocaleDateString('es-AR', { month: 'long', timeZone: TIMEZONE });
  const label = mes.charAt(0).toUpperCase() + mes.slice(1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')} ${label}`;
}

// Devuelve (creando si hace falta) la carpeta del mes actual dentro de "App Tareas".
async function ensureMonthFolder(drive) {
  let rootId = await getSetting('drive_root_id');
  if (rootId) {
    // Verificamos que siga existiendo; si no, lo recreamos.
    try {
      await drive.files.get({ fileId: rootId, fields: 'id, trashed' });
    } catch {
      rootId = null;
    }
  }
  if (!rootId) {
    rootId = await getOrCreateFolder(drive, 'App Tareas', 'root');
    await setSetting('drive_root_id', rootId);
  }
  return getOrCreateFolder(drive, monthFolderName(new Date()), rootId);
}

// Sube un archivo a la carpeta del mes. Devuelve el id del archivo en Drive.
async function uploadToDrive(adminUser, file) {
  const drive = google.drive({ version: 'v3', auth: clientForUser(adminUser) });
  const folderId = await ensureMonthFolder(drive);
  const res = await drive.files.create({
    requestBody: { name: file.originalname, parents: [folderId] },
    media: { mimeType: file.mimetype, body: Readable.from(file.buffer) },
    fields: 'id',
  });
  return res.data.id;
}

// Devuelve un stream con el contenido de un archivo de Drive (para mostrarlo en la app).
async function getDriveFileStream(adminUser, fileId) {
  const drive = google.drive({ version: 'v3', auth: clientForUser(adminUser) });
  const res = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'stream' });
  return res.data;
}

// Borra un archivo de Drive (ignora errores).
async function deleteDriveFile(adminUser, fileId) {
  try {
    const drive = google.drive({ version: 'v3', auth: clientForUser(adminUser) });
    await drive.files.delete({ fileId });
  } catch (err) {
    console.error('No se pudo borrar el archivo de Drive:', err.message);
  }
}

// Convierte una fecha (Date o string) a 'YYYY-MM-DD'.
function dateOnly(value) {
  if (typeof value === 'string') return value.slice(0, 10);
  const d = value instanceof Date ? value : new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Arma el cuerpo de fechas (día completo vs. con horario) para la API.
function buildEventTimes(event) {
  const dateStr = dateOnly(event.event_date);
  if (event.all_day) {
    const endDate = new Date(`${dateStr}T00:00:00`);
    endDate.setDate(endDate.getDate() + 1); // en Google el fin de un día completo es exclusivo
    const end = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`;
    return { start: { date: dateStr }, end: { date: end } };
  }
  const startTime = event.start_time || '09:00';
  const endTime = event.end_time || startTime;
  return {
    start: { dateTime: `${dateStr}T${startTime}:00`, timeZone: TIMEZONE },
    end: { dateTime: `${dateStr}T${endTime}:00`, timeZone: TIMEZONE },
  };
}

// Crea el evento en Google Calendar e invita a los asistentes. Devuelve {id, htmlLink}.
async function createGoogleEvent(adminUser, event, attendeeEmails) {
  const calendar = getCalendarForUser(adminUser);
  const times = buildEventTimes(event);

  const res = await calendar.events.insert({
    calendarId: 'primary',
    sendUpdates: 'all', // manda invitación por mail a los asistentes
    requestBody: {
      summary: event.title,
      description: event.description || undefined,
      location: event.location || undefined,
      start: times.start,
      end: times.end,
      attendees: attendeeEmails.map((email) => ({ email })),
    },
  });

  return { id: res.data.id, htmlLink: res.data.htmlLink };
}

// Borra el evento de Google Calendar (avisa a los invitados).
async function deleteGoogleEvent(adminUser, googleEventId) {
  const calendar = getCalendarForUser(adminUser);
  await calendar.events.delete({
    calendarId: 'primary',
    eventId: googleEventId,
    sendUpdates: 'all',
  });
}

module.exports = {
  TIMEZONE,
  getConnectUrl,
  saveTokensFromCode,
  hasCalendar,
  createGoogleEvent,
  deleteGoogleEvent,
  getAdminWithDrive,
  uploadToDrive,
  getDriveFileStream,
  deleteDriveFile,
};
