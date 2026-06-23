const { Pool } = require('pg');
const schemaSql = require('./schema');

// Render entrega la conexión por DATABASE_URL.
// ssl se activa en producción (Render requiere SSL para conexiones externas).
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// Ejecuta el esquema al arrancar. Es idempotente (CREATE ... IF NOT EXISTS).
async function initSchema() {
  await pool.query(schemaSql);
  console.log('Base de datos lista.');
}

module.exports = {
  pool,
  query: (text, params) => pool.query(text, params),
  initSchema,
};
