const { pool } = require('./config/db');

async function runAlters() {
  const connection = await pool.getConnection();
  try {
    console.log('Adding is_deleted columns...');
    try { await connection.query('ALTER TABLE users ADD COLUMN is_deleted BOOLEAN DEFAULT FALSE'); } catch(e) {}
    try { await connection.query('ALTER TABLE products ADD COLUMN is_deleted BOOLEAN DEFAULT FALSE'); } catch(e) {}
    try { await connection.query('ALTER TABLE offers ADD COLUMN is_deleted BOOLEAN DEFAULT FALSE'); } catch(e) {}
    console.log('Done!');
  } catch (error) {
    console.error(error);
  } finally {
    connection.release();
    process.exit();
  }
}

runAlters();
