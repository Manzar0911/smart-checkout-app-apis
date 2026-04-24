const { pool } = require('./config/db');

async function updateDb() {
  console.log('Applying DB changes...');
  try {
    const connection = await pool.getConnection();
    
    console.log('Dropping dependent tables...');
    await connection.query('DROP TABLE IF EXISTS cart_items');
    await connection.query('DROP TABLE IF EXISTS order_items');
    await connection.query('DROP TABLE IF EXISTS barcodes');
    await connection.query('DROP TABLE IF EXISTS products');
    
    console.log('Tables dropped. The server will recreate them automatically on next start/request.');
    
    connection.release();
    process.exit(0);
  } catch (error) {
    console.error('Failed to update DB:', error);
    process.exit(1);
  }
}

updateDb();
