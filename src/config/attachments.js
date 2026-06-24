const multer = require('multer');
const db = require('../db');
const gdrive = require('./google');

// Archivos en memoria; luego se suben a Drive. Máx 10 MB y 5 por vez.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 5 },
});

// Middleware de subida (campo "files"); muestra un mensaje amable si falla.
function uploadFiles(req, res, next) {
  upload.array('files', 5)(req, res, (err) => {
    if (err) {
      req.session.flash = {
        type: 'error',
        text: 'No se pudo subir el archivo. Revisá que pese menos de 10 MB y que no sean más de 5 archivos.',
      };
      return res.redirect('back');
    }
    next();
  });
}

// Sube los archivos a Google Drive y guarda la referencia. Devuelve un resumen.
async function saveAttachments(ownerType, ownerId, files, uploaderId, folderPath) {
  if (!files || files.length === 0) return { uploaded: 0, failed: 0, noConnection: false };
  const admin = await gdrive.getAdminWithDrive();
  if (!admin) return { uploaded: 0, failed: files.length, noConnection: true };

  const segments = Array.isArray(folderPath) && folderPath.length ? folderPath : ['Otros'];
  let uploaded = 0;
  let failed = 0;
  let errorMessage = null;
  for (const f of files) {
    try {
      const driveId = await gdrive.uploadToDrive(admin, f, segments);
      await db.query(
        `INSERT INTO attachments (owner_type, owner_id, filename, mime_type, size_bytes, drive_file_id, uploaded_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [ownerType, ownerId, f.originalname, f.mimetype, f.size, driveId, uploaderId]
      );
      uploaded += 1;
    } catch (err) {
      console.error('No se pudo subir a Drive:', err.message);
      if (!errorMessage) errorMessage = err.message;
      failed += 1;
    }
  }
  return { uploaded, failed, noConnection: false, errorMessage };
}

// Arma el mensaje según cómo salió la subida de adjuntos.
function attachmentFlash(baseOkText, result) {
  if (result.noConnection && result.failed > 0) {
    return { type: 'error', text: `${baseOkText} Los archivos no se guardaron: conectá tu Google en el Buzón/Calendario.` };
  }
  if (result.failed > 0) {
    const reason = result.errorMessage ? ` Motivo: ${result.errorMessage}` : '';
    return { type: 'error', text: `${baseOkText} Algunos archivos no se pudieron subir a Drive.${reason}` };
  }
  return { type: 'ok', text: baseOkText };
}

// Lista los adjuntos de un objeto.
async function attachmentsFor(ownerType, ownerId) {
  const { rows } = await db.query(
    `SELECT id, filename, mime_type, size_bytes
       FROM attachments WHERE owner_type = $1 AND owner_id = $2
       ORDER BY created_at`,
    [ownerType, ownerId]
  );
  return rows;
}

// Borra todos los adjuntos de un objeto (también de Drive).
async function deleteAttachmentsFor(ownerType, ownerId) {
  const { rows } = await db.query(
    'SELECT drive_file_id FROM attachments WHERE owner_type = $1 AND owner_id = $2',
    [ownerType, ownerId]
  );
  if (rows.length === 0) return;
  const admin = await gdrive.getAdminWithDrive();
  if (admin) {
    for (const r of rows) {
      if (r.drive_file_id) await gdrive.deleteDriveFile(admin, r.drive_file_id);
    }
  }
  await db.query('DELETE FROM attachments WHERE owner_type = $1 AND owner_id = $2', [ownerType, ownerId]);
}

// Borra un adjunto puntual (también de Drive).
async function deleteAttachment(id) {
  const { rows } = await db.query('SELECT drive_file_id FROM attachments WHERE id = $1', [id]);
  if (rows.length === 0) return;
  if (rows[0].drive_file_id) {
    const admin = await gdrive.getAdminWithDrive();
    if (admin) await gdrive.deleteDriveFile(admin, rows[0].drive_file_id);
  }
  await db.query('DELETE FROM attachments WHERE id = $1', [id]);
}

module.exports = {
  uploadFiles,
  saveAttachments,
  attachmentFlash,
  attachmentsFor,
  deleteAttachmentsFor,
  deleteAttachment,
};
