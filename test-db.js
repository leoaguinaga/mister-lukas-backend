const { Pool } = require('pg');
require('dotenv').config();

async function main() {
  const connectionString = process.env.DATABASE_URL;
  console.log('DATABASE_URL:', connectionString ? connectionString.replace(/:[^:@]+@/, ':***@') : 'NO ENCONTRADA');
  if (!connectionString) {
    console.error('Error: DATABASE_URL no está definida en el archivo .env');
    process.exit(1);
  }

  const pool = new Pool({ connectionString });
  try {
    const client = await pool.connect();
    console.log('--- DIAGNÓSTICO DE BASE DE DATOS ---');
    console.log('Conexión exitosa.');

    const dbInfo = await client.query("SELECT current_database(), current_user, version()");
    console.log('Base de Datos activa:', dbInfo.rows[0].current_database);
    console.log('Usuario:', dbInfo.rows[0].current_user);

    const tables = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    console.log('Tablas encontradas:', tables.rows.map(r => r.table_name).join(', '));

    const hasMigrationsTable = tables.rows.some(r => r.table_name === '__drizzle_migrations');
    if (hasMigrationsTable) {
      const migrations = await client.query('SELECT id, hash, created_at FROM __drizzle_migrations');
      console.log('Migraciones en __drizzle_migrations:');
      migrations.rows.forEach(m => console.log(` - ID: ${m.id}, Hash: ${m.hash}, Creada: ${m.created_at}`));
    } else {
      console.log('La tabla __drizzle_migrations no existe.');
    }

    const hasPlatoCarta = tables.rows.some(r => r.table_name === 'plato_carta');
    if (hasPlatoCarta) {
      const cols = await client.query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'plato_carta'
      `);
      console.log('Columnas de la tabla "plato_carta":');
      cols.rows.forEach(c => console.log(` - ${c.column_name} (${c.data_type})`));
    } else {
      console.log('La tabla "plato_carta" no existe.');
    }

    client.release();
  } catch (err) {
    console.error('Error al conectar o consultar la base de datos:', err);
  } finally {
    await pool.end();
  }
}

main();
