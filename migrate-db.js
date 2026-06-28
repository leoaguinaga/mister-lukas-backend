const { Pool } = require('pg');
const { drizzle } = require('drizzle-orm/node-postgres');
const { migrate } = require('drizzle-orm/node-postgres/migrator');
require('dotenv').config();

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL no está definida en el archivo .env');
    process.exit(1);
  }

  const pool = new Pool({ connectionString });
  const db = drizzle(pool);

  console.log('Iniciando migración programática con Drizzle...');
  try {
    await migrate(db, { migrationsFolder: './drizzle' });
    console.log('¡Migración completada con éxito!');
  } catch (err) {
    console.error('Error durante la migración:', err);
  } finally {
    await pool.end();
  }
}

main();
