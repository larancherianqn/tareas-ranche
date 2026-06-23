const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

// Render entrega la conexión por DATABASE_URL.
// ssl se activa en producción (Render requiere SSL para conexiones externas).
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// Ejecuta el schema.sql al arrancar. Es idempotente (CREATE ... IF NOT EXISTS).
async function initSchema() {
  const schemaPath = path.join(__dirname, '..', 'db', 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');
  await pool.query(sql);
  console.log('Base de datos lista.');
}

module.exports = {
  pool,
  query: (text, params) => pool.query(text, params),
  initSchema,
};
