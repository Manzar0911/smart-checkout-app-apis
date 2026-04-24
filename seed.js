/**
 * Seed script - populates MySQL with the products and offers
 * from the original static data.
 * 
 * Run: npm run seed
 */
require('dotenv').config();
const mysql = require('mysql2/promise');

const PRODUCTS = [
  {
    id: '8901234567001',
    name: 'Aloo Bhujia',
    brand: "Haldiram's",
    price: 95,
    original_price: 110,
    discount: 14,
    image: 'https://www.thai-food-online.co.uk/cdn/shop/products/Haldirams-Aloo-Bhujia-200g-Front.png',
    ingredients: 'Potato, Edible Vegetable Oil, Gram Flour, Spices & Condiments',
    packaging: 'Pouch, 400g',
    expiry_date: '2026-12-15',
    category: 'Namkeen',
    weight: '400g',
  },
  {
    id: '8901234567002',
    name: 'Magic Masala Chips',
    brand: "Lay's",
    price: 20,
    original_price: 20,
    discount: 0,
    image: 'https://tse3.mm.bing.net/th/id/OIP.itq2GDTaTe3nMHhOIdznhAHaHa?rs=1&pid=ImgDetMain&o=7&rm=3',
    ingredients: 'Potato, Edible Vegetable Oil, Spices, Salt, Tomato Powder',
    packaging: 'Pouch, 50g',
    expiry_date: '2027-02-20',
    category: 'Chips',
    weight: '50g',
  },
  {
    id: '8901234567003',
    name: 'Masala Kurkure',
    brand: 'Kurkure',
    price: 20,
    original_price: 25,
    discount: 20,
    image: 'https://m.media-amazon.com/images/I/71sOPzrW0mL._SX679_.jpg',
    ingredients: 'Rice Meal, Edible Vegetable Oil, Corn Meal, Gram Meal, Spices',
    packaging: 'Pouch, 90g',
    expiry_date: '2027-01-10',
    category: 'Snacks',
    weight: '90g',
  },
  {
    id: '8901234567004',
    name: 'Roasted Makhana (Salt & Pepper)',
    brand: 'Mr. Makhana',
    price: 150,
    original_price: 199,
    discount: 25,
    image: 'https://bf1af2.akinoncloudcdn.com/products/2024/09/10/63957/73e7fd52-e6d0-41c5-a4b1-f7725699bf3a_size3840_cropCenter.jpg',
    ingredients: 'Popped Lotus Seeds, Olive Oil, Black Pepper, Himalayan Pink Salt',
    packaging: 'Zip Lock Pouch, 100g',
    expiry_date: '2027-04-01',
    category: 'Healthy Snacks',
    weight: '100g',
  },
  {
    id: '8901234567005',
    name: 'Diet Mixture',
    brand: 'Bikaji',
    price: 180,
    original_price: 200,
    discount: 10,
    image: 'https://bgstores.in/wp-content/uploads/2020/08/haldirams-deit-200-300x300.png',
    ingredients: 'Rice Flakes, Gram Flour, Edible Vegetable Oil, Peanuts, Spices',
    packaging: 'Pouch, 500g',
    expiry_date: '2027-03-25',
    category: 'Diet Snacks',
    weight: '500g',
  },
  {
    id: '8901234567006',
    name: 'Mad Angles Achaari Masti',
    brand: 'Bingo!',
    price: 35,
    original_price: 40,
    discount: 12,
    image: 'https://www.bigbasket.com/media/uploads/p/l/238341_24-bingo-mad-angles-achaari-masti.jpg',
    ingredients: 'Rice Grits, Edible Vegetable Oil, Corn Grits, Gram Grits, Achaari Seasoning',
    packaging: 'Pouch, 130g',
    expiry_date: '2026-11-28',
    category: 'Chips',
    weight: '130g',
  },
  {
    id: '8901234567007',
    name: 'NutriChoice Digestive Biscuits',
    brand: 'Britannia',
    price: 60,
    original_price: 65,
    discount: 8,
    image: 'https://d3olmw93qe7qxx.cloudfront.net/images/products/B9001448.jpg',
    ingredients: 'Refined Wheat Flour, Whole Wheat Flour, Edible Vegetable Oil, Sugar',
    packaging: 'Wrapper, 250g',
    expiry_date: '2027-05-15',
    category: 'Crackers',
    weight: '250g',
  },
  {
    id: '8901234567008',
    name: 'Khara Biscuit',
    brand: 'Karachi Bakery',
    price: 160,
    original_price: 180,
    discount: 11,
    image: 'https://th.bing.com/th/id/OIP.tG6dKArUnMWg2zk85KC79AHaFn?w=240&h=182&c=7&r=0&o=7&pid=1.7&rm=3',
    ingredients: 'Refined Wheat Flour, Interesterified Vegetable Fat, Sugar, Salt, Spices',
    packaging: 'Box, 400g',
    expiry_date: '2026-12-31',
    category: 'Crackers',
    weight: '400g',
  },
];

const OFFERS = [
  {
    id: 'o1',
    title: 'Festive Save 20%',
    subtitle: 'Use Code: FESTIVAL20',
    color: '#FF6B35',
    code: 'FESTIVAL20',
    discount_type: 'percent',
    discount_value: 20,
  },
  {
    id: 'o2',
    title: 'Flat ₹50 Off',
    subtitle: 'Use Code: FLAT50',
    color: '#00D4AA',
    code: 'FLAT50',
    discount_type: 'fixed',
    discount_value: 50,
  },
  {
    id: 'o3',
    title: 'Snacks Combo',
    subtitle: 'Extra 10% Off',
    color: '#7B68EE',
    code: 'COMBO10',
    discount_type: 'percent',
    discount_value: 10,
  },
];

async function seed() {
  let connection;
  try {
    // First create the database if it doesn't exist
    const tempConn = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT) || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
    });
    await tempConn.query(`CREATE DATABASE IF NOT EXISTS \`${process.env.DB_NAME || 'smart_checkout'}\``);
    await tempConn.end();

    // Now connect to the database
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT) || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'smart_checkout',
    });

    console.log('📦 Connected to MySQL...');

    // Create tables
    await connection.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100),
        email VARCHAR(255) UNIQUE,
        phone VARCHAR(15) UNIQUE NOT NULL,
        password_hash VARCHAR(255),
        address TEXT,
        is_profile_complete BOOLEAN DEFAULT FALSE,
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

    await connection.query(`
      CREATE TABLE IF NOT EXISTS products (
        id VARCHAR(20) PRIMARY KEY,
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
        weight VARCHAR(20),
        is_active BOOLEAN DEFAULT TRUE
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS offers (
        id VARCHAR(10) PRIMARY KEY,
        title VARCHAR(100) NOT NULL,
        subtitle VARCHAR(150),
        color VARCHAR(10),
        code VARCHAR(30) UNIQUE NOT NULL,
        discount_type ENUM('percent','fixed') NOT NULL,
        discount_value DECIMAL(10,2) NOT NULL,
        is_active BOOLEAN DEFAULT TRUE
      )
    `);

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
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS order_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        order_id VARCHAR(30) NOT NULL,
        product_id VARCHAR(20) NOT NULL,
        quantity INT NOT NULL,
        price DECIMAL(10,2) NOT NULL,
        FOREIGN KEY (order_id) REFERENCES orders(id),
        FOREIGN KEY (product_id) REFERENCES products(id)
      )
    `);

    console.log('✅ Tables created');

    // Seed products (upsert)
    for (const p of PRODUCTS) {
      await connection.query(
        `INSERT INTO products (id, name, brand, price, original_price, discount, image, ingredients, packaging, expiry_date, category, weight)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           name = VALUES(name), brand = VALUES(brand), price = VALUES(price),
           original_price = VALUES(original_price), discount = VALUES(discount),
           image = VALUES(image), ingredients = VALUES(ingredients),
           packaging = VALUES(packaging), expiry_date = VALUES(expiry_date),
           category = VALUES(category), weight = VALUES(weight)`,
        [p.id, p.name, p.brand, p.price, p.original_price, p.discount, p.image, p.ingredients, p.packaging, p.expiry_date, p.category, p.weight]
      );
    }
    console.log(`✅ Seeded ${PRODUCTS.length} products`);

    // Seed offers (upsert)
    for (const o of OFFERS) {
      await connection.query(
        `INSERT INTO offers (id, title, subtitle, color, code, discount_type, discount_value)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           title = VALUES(title), subtitle = VALUES(subtitle), color = VALUES(color),
           code = VALUES(code), discount_type = VALUES(discount_type), discount_value = VALUES(discount_value)`,
        [o.id, o.title, o.subtitle, o.color, o.code, o.discount_type, o.discount_value]
      );
    }
    console.log(`✅ Seeded ${OFFERS.length} offers`);

    console.log('\n🎉 Database seeded successfully!');
  } catch (error) {
    console.error('❌ Seed error:', error.message);
    process.exit(1);
  } finally {
    if (connection) await connection.end();
    process.exit(0);
  }
}

seed();
