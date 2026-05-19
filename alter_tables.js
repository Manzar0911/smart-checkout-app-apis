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

    // ── New: Buy X Get Y Free (BXGY) Offer Columns ──
    console.log('\n7. Adding BXGY columns to offers...');
    try { await connection.query("ALTER TABLE offers ADD COLUMN offer_type VARCHAR(30) DEFAULT 'coupon'"); console.log('   ✅ offers.offer_type added'); } catch(e) { console.log('   ⏭️  offers.offer_type already exists'); }
    try { await connection.query('ALTER TABLE offers ADD COLUMN buy_product_id INT NULL'); console.log('   ✅ offers.buy_product_id added'); } catch(e) { console.log('   ⏭️  offers.buy_product_id already exists'); }
    try { await connection.query('ALTER TABLE offers ADD COLUMN buy_quantity INT DEFAULT 1'); console.log('   ✅ offers.buy_quantity added'); } catch(e) { console.log('   ⏭️  offers.buy_quantity already exists'); }
    try { await connection.query('ALTER TABLE offers ADD COLUMN get_product_id INT NULL'); console.log('   ✅ offers.get_product_id added'); } catch(e) { console.log('   ⏭️  offers.get_product_id already exists'); }
    try { await connection.query('ALTER TABLE offers ADD COLUMN get_quantity INT DEFAULT 1'); console.log('   ✅ offers.get_quantity added'); } catch(e) { console.log('   ⏭️  offers.get_quantity already exists'); }
    try { await connection.query('ALTER TABLE offers ADD COLUMN allow_stacking BOOLEAN DEFAULT TRUE'); console.log('   ✅ offers.allow_stacking added'); } catch(e) { console.log('   ⏭️  offers.allow_stacking already exists'); }
    try { await connection.query('ALTER TABLE offers ADD COLUMN max_free_qty_per_order INT NULL'); console.log('   ✅ offers.max_free_qty_per_order added'); } catch(e) { console.log('   ⏭️  offers.max_free_qty_per_order already exists'); }
    try { await connection.query('ALTER TABLE offers ADD COLUMN max_usage_per_user INT NULL'); console.log('   ✅ offers.max_usage_per_user added'); } catch(e) { console.log('   ⏭️  offers.max_usage_per_user already exists'); }
    try { await connection.query('ALTER TABLE offers ADD COLUMN max_usage_total INT NULL'); console.log('   ✅ offers.max_usage_total added'); } catch(e) { console.log('   ⏭️  offers.max_usage_total already exists'); }
    try { await connection.query('ALTER TABLE offers ADD COLUMN usage_count INT DEFAULT 0'); console.log('   ✅ offers.usage_count added'); } catch(e) { console.log('   ⏭️  offers.usage_count already exists'); }
    try { await connection.query('ALTER TABLE offers ADD COLUMN priority INT DEFAULT 0'); console.log('   ✅ offers.priority added'); } catch(e) { console.log('   ⏭️  offers.priority already exists'); }

    // Backfill existing offers as coupon type
    try { await connection.query("UPDATE offers SET offer_type = 'coupon' WHERE offer_type IS NULL"); console.log('   ✅ Backfilled NULL offer_type values'); } catch(e) { console.log('   ⚠️  Backfill skipped:', e.message); }

    // ── New: Free item columns on order_items ──
    console.log('\n8. Adding free-item columns to order_items...');
    try { await connection.query('ALTER TABLE order_items ADD COLUMN is_free_item BOOLEAN DEFAULT FALSE'); console.log('   ✅ order_items.is_free_item added'); } catch(e) { console.log('   ⏭️  order_items.is_free_item already exists'); }
    try { await connection.query('ALTER TABLE order_items ADD COLUMN offer_id VARCHAR(20) NULL'); console.log('   ✅ order_items.offer_id added'); } catch(e) { console.log('   ⏭️  order_items.offer_id already exists'); }
    try { await connection.query('ALTER TABLE order_items ADD COLUMN original_price DECIMAL(10,2) NULL'); console.log('   ✅ order_items.original_price added'); } catch(e) { console.log('   ⏭️  order_items.original_price already exists'); }
    try { await connection.query('ALTER TABLE order_items ADD COLUMN discount_amount DECIMAL(10,2) DEFAULT 0'); console.log('   ✅ order_items.discount_amount added'); } catch(e) { console.log('   ⏭️  order_items.discount_amount already exists'); }

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
