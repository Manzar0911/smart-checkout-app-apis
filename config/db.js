const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'smart_checkout',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// Initialize database tables
async function initializeDB() {
  const connection = await pool.getConnection();
  try {
    // Create users table - phone is primary, email/password optional
    await connection.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100),
        email VARCHAR(255) UNIQUE,
        phone VARCHAR(15) UNIQUE NOT NULL,
        password_hash VARCHAR(255),
        address TEXT,
        role ENUM('user', 'admin','employee','guard') DEFAULT 'user',
        is_profile_complete BOOLEAN DEFAULT FALSE,
        is_deleted BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // OTP table for phone verification
    await connection.query(`
      CREATE TABLE IF NOT EXISTS otps (
        id INT AUTO_INCREMENT PRIMARY KEY,
        phone VARCHAR(15) NOT NULL,
        otp_code VARCHAR(6) NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        is_used BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_phone (phone),
        INDEX idx_expires (expires_at)
      )
    `);

    // Create categories table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS categories (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create products table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS products (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(150) NOT NULL,
        brand VARCHAR(100) NOT NULL,
        price DECIMAL(10,2) NOT NULL,
        original_price DECIMAL(10,2) NOT NULL,
        discount INT DEFAULT 0,
        image TEXT,
        ingredients TEXT,
        packaging VARCHAR(100),
        expiry_date DATE,
        category VARCHAR(50),
        category_id INT,
        weight VARCHAR(20),
        stock_quantity INT DEFAULT 0,
        mfg_date DATE,
        is_active BOOLEAN DEFAULT TRUE,
        is_deleted BOOLEAN DEFAULT FALSE,
        FOREIGN KEY (category_id) REFERENCES categories(id)
      )
    `);

    // Create barcodes table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS barcodes (
        barcode VARCHAR(50) PRIMARY KEY,
        product_id INT NOT NULL,
        mfg_date DATE,
        expiry_date DATE,
        quantity INT DEFAULT 0,
        number_stock INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (product_id) REFERENCES products(id)
      )
    `);

    // Create offers table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS offers (
        id VARCHAR(10) PRIMARY KEY,
        title VARCHAR(100) NOT NULL,
        subtitle VARCHAR(150),
        color VARCHAR(10),
        code VARCHAR(30) UNIQUE NOT NULL,
        discount_type ENUM('percent','fixed') NOT NULL,
        discount_value DECIMAL(10,2) NOT NULL,
        is_active BOOLEAN DEFAULT TRUE,
        is_deleted BOOLEAN DEFAULT FALSE
      )
    `);

    // Create orders table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id VARCHAR(30) PRIMARY KEY,
        user_id INT NOT NULL,
        subtotal DECIMAL(10,2),
        discount DECIMAL(10,2) DEFAULT 0,
        coupon_code VARCHAR(30),
        total DECIMAL(10,2) NOT NULL,
        payment_method VARCHAR(50),
        transaction_id VARCHAR(50),
        status ENUM('pending','paid','verified','cancelled') DEFAULT 'pending',
        created_by INT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (created_by) REFERENCES users(id)
      )
    `);

    // Create order_items table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS order_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        order_id VARCHAR(30) NOT NULL,
        product_id INT NOT NULL,
        quantity INT NOT NULL,
        price DECIMAL(10,2) NOT NULL,
        FOREIGN KEY (order_id) REFERENCES orders(id),
        FOREIGN KEY (product_id) REFERENCES products(id)
      )
    `);

    // Create cart_items table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS cart_items (
        user_id INT NOT NULL,
        product_id INT NOT NULL,
        quantity INT NOT NULL DEFAULT 1,
        PRIMARY KEY (user_id, product_id),
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (product_id) REFERENCES products(id)
      )
    `);

    // Create vendors table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS vendors (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(150) NOT NULL,
        phone VARCHAR(15) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create vendor_bills table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS vendor_bills (
        id INT AUTO_INCREMENT PRIMARY KEY,
        vendor_id INT NOT NULL,
        total_amount DECIMAL(10,2) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (vendor_id) REFERENCES vendors(id)
      )
    `);

    // Create vendor_bill_items table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS vendor_bill_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        vendor_bill_id INT NOT NULL,
        product_id INT NOT NULL,
        quantity INT NOT NULL,
        price DECIMAL(10,2) NOT NULL,
        FOREIGN KEY (vendor_bill_id) REFERENCES vendor_bills(id),
        FOREIGN KEY (product_id) REFERENCES products(id)
      )
    `);

    console.log('✅ Database tables initialized');
  } catch (error) {
    console.error('❌ Database initialization error:', error.message);
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = { pool, initializeDB };
