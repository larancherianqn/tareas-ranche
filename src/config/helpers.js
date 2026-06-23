// Etiquetas legibles y orden de los estados.
const STATUSES = [
  { value: 'pendiente', label: 'Pendiente' },
  { value: 'en_curso', label: 'En curso' },
  { value: 'hecha', label: 'Hecha' },
];

function statusLabel(value) {
  const found = STATUSES.find((s) => s.value === value);
  return found ? found.label : value;
}

// Tipos de tarea.
const CATEGORIES = [
  { value: 'mantenimiento', label: 'Mantenimiento' },
  { value: 'limpieza', label: 'Limpieza' },
  { value: 'administrativa', label: 'Administrativa' },
  { value: 'operativa', label: 'Operativa' },
  { value: 'diaria', label: 'Diaria' },
];

function categoryLabel(value) {
  const found = CATEGORIES.find((c) => c.value === value);
  return found ? found.label : value;
}

// Fecha en formato dd/mm/aaaa (es-AR). Acepta Date o string.
function formatDate(value) {
  if (!value) return '—';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// Fecha y hora, para el historial de avances.
function formatDateTime(value) {
  if (!value) return '—';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

// Convierte una fecha (date de Postgres) a "aaaa-mm-dd" para inputs date.
function toInputDate(value) {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Devuelve cuántos días faltan (negativo si ya venció). null si no hay fecha.
function daysUntil(dueDate) {
  if (!dueDate) return null;
  const d = dueDate instanceof Date ? dueDate : new Date(dueDate);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.round((d - today) / (1000 * 60 * 60 * 24));
}

// Etiqueta del horario de un evento.
function eventTimeLabel(event) {
  if (!event) return '';
  if (event.all_day) return 'Todo el día';
  if (event.start_time && event.end_time) return `${event.start_time} a ${event.end_time}`;
  if (event.start_time) return event.start_time;
  return 'Todo el día';
}

// --- Avisos y solicitudes ---
const ANNOUNCEMENT_KINDS = [
  { value: 'aviso', label: 'Aviso' },
  { value: 'cronograma', label: 'Cronograma' },
  { value: 'dia_no_laborable', label: 'Día no laborable' },
];
const REQUEST_KINDS = [
  { value: 'enfermedad', label: 'Licencia por enfermedad' },
  { value: 'vacaciones', label: 'Vacaciones' },
  { value: 'personal', label: 'Día personal' },
  { value: 'otro', label: 'Otro' },
];
const REQUEST_STATUSES = [
  { value: 'pendiente', label: 'Pendiente' },
  { value: 'aprobada', label: 'Aprobada' },
  { value: 'rechazada', label: 'Rechazada' },
];

function labelFrom(list, value) {
  const f = list.find((x) => x.value === value);
  return f ? f.label : value;
}

function announcementKindLabel(v) { return labelFrom(ANNOUNCEMENT_KINDS, v); }
function requestKindLabel(v) { return labelFrom(REQUEST_KINDS, v); }
function requestStatusLabel(v) { return labelFrom(REQUEST_STATUSES, v); }

// Tamaño de archivo legible.
function fileSize(bytes) {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

module.exports = {
  STATUSES, statusLabel, CATEGORIES, categoryLabel,
  formatDate, formatDateTime, toInputDate, daysUntil, eventTimeLabel,
  ANNOUNCEMENT_KINDS, REQUEST_KINDS, REQUEST_STATUSES,
  announcementKindLabel, requestKindLabel, requestStatusLabel, fileSize,
};
