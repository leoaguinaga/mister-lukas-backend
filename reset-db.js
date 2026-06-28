const { Pool } = require('pg');
require('dotenv').config();

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL no está definida en el archivo .env');
    process.exit(1);
  }

  console.log('Limpiando base de datos (DROP SCHEMA public CASCADE)...');
  const pool = new Pool({ connectionString });
  try {
    const client = await pool.connect();
    await client.query('DROP SCHEMA public CASCADE');
    await client.query('CREATE SCHEMA public');
    console.log('¡Base de datos limpiada con éxito! El esquema público está vacío.');
    client.release();
  } catch (err) {
    console.error('Error al limpiar la base de datos:', err);
  } finally {
    await pool.end();
  }
}

main();
