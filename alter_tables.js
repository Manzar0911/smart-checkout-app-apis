const { pool } = require('./config/db');

async function runAlters() {
  const connection = await pool.getConnection();
  try {
    console.log('Running safe database migrations...\n');

    // ── Existing migrations (preserved) ──
    console.log('1. Adding is_deleted columns...');
    try { await connection.query('ALTER TABLE users ADD COLUMN is_deleted BOOLEAN DEFAULT FALSE'); } catch(e) {}
    try { await connection.query('ALTER TABLE products ADD COLUMN is_deleted BOOLEAN DEFAULT FALSE'); } catch(e) {}
    try { await connection.query('ALTER TABLE offers ADD COLUMN is_deleted BOOLEAN DEFAULT FALSE'); } catch(e) {}
    console.log('   ✅ is_deleted columns done.\n');

    // ── New: Flexible Date Type Migrations ──

    // --- Products table ---
    console.log('2. Adding flexible date type columns to products...');
    try { await connection.query("ALTER TABLE products ADD COLUMN mfg_date_type VARCHAR(30) DEFAULT 'full_date'"); console.log('   ✅ products.mfg_date_type added'); } catch(e) { console.log('   ⏭️  products.mfg_date_type already exists'); }
    try { await connection.query("ALTER TABLE products ADD COLUMN expiry_date_type VARCHAR(30) DEFAULT 'full_date'"); console.log('   ✅ products.expiry_date_type added'); } catch(e) { console.log('   ⏭️  products.expiry_date_type already exists'); }

    // Safely convert DATE columns to VARCHAR(20) for products
    console.log('3. Converting products date columns to VARCHAR...');
    try { await connection.query('ALTER TABLE products MODIFY COLUMN mfg_date VARCHAR(20)'); console.log('   ✅ products.mfg_date → VARCHAR(20)'); } catch(e) { console.log('   ⚠️  products.mfg_date conversion skipped:', e.message); }
    try { await connection.query('ALTER TABLE products MODIFY COLUMN expiry_date VARCHAR(20)'); console.log('   ✅ products.expiry_date → VARCHAR(20)'); } catch(e) { console.log('   ⚠️  products.expiry_date conversion skipped:', e.message); }

    // --- Barcodes table ---
    console.log('\n4. Adding flexible date type columns to barcodes...');
    try { await connection.query("ALTER TABLE barcodes ADD COLUMN mfg_date_type VARCHAR(30) DEFAULT 'full_date'"); console.log('   ✅ barcodes.mfg_date_type added'); } catch(e) { console.log('   ⏭️  barcodes.mfg_date_type already exists'); }
    try { await connection.query("ALTER TABLE barcodes ADD COLUMN expiry_date_type VARCHAR(30) DEFAULT 'full_date'"); console.log('   ✅ barcodes.expiry_date_type added'); } catch(e) { console.log('   ⏭️  barcodes.expiry_date_type already exists'); }

    // Safely convert DATE columns to VARCHAR(20) for barcodes
    console.log('5. Converting barcodes date columns to VARCHAR...');
    try { await connection.query('ALTER TABLE barcodes MODIFY COLUMN mfg_date VARCHAR(20)'); console.log('   ✅ barcodes.mfg_date → VARCHAR(20)'); } catch(e) { console.log('   ⚠️  barcodes.mfg_date conversion skipped:', e.message); }
    try { await connection.query('ALTER TABLE barcodes MODIFY COLUMN expiry_date VARCHAR(20)'); console.log('   ✅ barcodes.expiry_date → VARCHAR(20)'); } catch(e) { console.log('   ⚠️  barcodes.expiry_date conversion skipped:', e.message); }

    // ── New: Barcode Source Column (Map Existing Barcode feature) ──
    console.log('\n6. Adding barcode_source column to barcodes...');
    try { await connection.query("ALTER TABLE barcodes ADD COLUMN barcode_source VARCHAR(30) DEFAULT 'generated'"); console.log('   ✅ barcodes.barcode_source added'); } catch(e) { console.log('   ⏭️  barcodes.barcode_source already exists'); }

    // Backfill any NULL barcode_source values to 'generated'
    try { await connection.query("UPDATE barcodes SET barcode_source = 'generated' WHERE barcode_source IS NULL"); console.log('   ✅ Backfilled NULL barcode_source values'); } catch(e) { console.log('   ⚠️  Backfill skipped:', e.message); }

    console.log('\n✅ All migrations completed successfully!');
  } catch (error) {
    console.error('❌ Migration error:', error);
  } finally {
    connection.release();
    if (require.main === module) {
      process.exit();
    }
  }
}

if (require.main === module) {
  runAlters();
}

module.exports = { runAlters };
