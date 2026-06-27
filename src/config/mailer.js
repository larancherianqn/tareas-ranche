const nodemailer = require('nodemailer');

// Configuración por variables de entorno:
//   MAIL_USER = tu dirección de Gmail (ej: larancheria@gmail.com)
//   MAIL_PASS = "contraseña de aplicación" de 16 caracteres (no la contraseña normal)
//   MAIL_FROM = (opcional) nombre/dirección que aparece como remitente
// Si no están configuradas, el envío se omite silenciosamente.

let transporter = null;
function getTransporter() {
  if (transporter) return transporter;
  if (!process.env.MAIL_USER || !process.env.MAIL_PASS) return null;
  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS },
  });
  return transporter;
}

function isConfigured() {
  return !!(process.env.MAIL_USER && process.env.MAIL_PASS);
}

// Envía el aviso por mail a una lista de destinatarios (en copia oculta).
async function sendAvisoEmail(recipients, aviso, baseUrl) {
  const t = getTransporter();
  const list = (recipients || []).filter(Boolean);
  if (!t || list.length === 0) return { sent: 0, skipped: true };

  const link = baseUrl ? `\n\nVerlo en la app: ${baseUrl}/buzon` : '';
  const cuerpo = aviso.body ? `\n\n${aviso.body}` : '';
  await t.sendMail({
    from: process.env.MAIL_FROM || `Tareas <${process.env.MAIL_USER}>`,
    to: process.env.MAIL_USER, // remitente como destinatario visible
    bcc: list,                 // el equipo va en copia oculta (no se ven entre sí)
    subject: `Nuevo aviso: ${aviso.title}`,
    text: `Se publicó un nuevo aviso en el Buzón.\n\n${aviso.title}${cuerpo}${link}`,
  });
  return { sent: list.length, skipped: false };
}

module.exports = { sendAvisoEmail, isConfigured };
