const { pool } = require('./config/db');

async function runAlters() {
  console.log('Connecting to database...');
  const connection = await pool.getConnection();
  console.log('Connection established.');
  try {
    console.log('Adding is_deleted columns...');
    try { await connection.query('ALTER TABLE users ADD COLUMN is_deleted BOOLEAN DEFAULT FALSE'); } catch(e) {}
    try { await connection.query('ALTER TABLE products ADD COLUMN is_deleted BOOLEAN DEFAULT FALSE'); } catch(e) {}
    try { await connection.query('ALTER TABLE offers ADD COLUMN is_deleted BOOLEAN DEFAULT FALSE'); } catch(e) {}
    
    console.log('Adding date support columns...');
    try { await connection.query("ALTER TABLE products ADD COLUMN manufacturing_date_type VARCHAR(30) DEFAULT 'full_date'"); } catch(e) {}
    try { await connection.query("ALTER TABLE products ADD COLUMN expiry_date_type VARCHAR(30) DEFAULT 'full_date'"); } catch(e) {}
    try { await connection.query('ALTER TABLE products MODIFY COLUMN mfg_date VARCHAR(20)'); } catch(e) {}
    try { await connection.query('ALTER TABLE products MODIFY COLUMN expiry_date VARCHAR(20)'); } catch(e) {}

    try { await connection.query("ALTER TABLE barcodes ADD COLUMN manufacturing_date_type VARCHAR(30) DEFAULT 'full_date'"); } catch(e) {}
    try { await connection.query("ALTER TABLE barcodes ADD COLUMN expiry_date_type VARCHAR(30) DEFAULT 'full_date'"); } catch(e) {}
    try { await connection.query('ALTER TABLE barcodes MODIFY COLUMN mfg_date VARCHAR(20)'); } catch(e) {}
    try { await connection.query('ALTER TABLE barcodes MODIFY COLUMN expiry_date VARCHAR(20)'); } catch(e) {}
    console.log('Done!');
  } catch (error) {
    console.error(error);
  } finally {
    connection.release();
    process.exit();
  }
}

runAlters();
