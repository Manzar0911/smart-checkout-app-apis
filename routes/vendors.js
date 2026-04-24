const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');
const auth = require('../middleware/auth');

// Search vendors by name
router.get('/search', auth, async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.json([]);

    const [rows] = await pool.query(
      'SELECT * FROM vendors WHERE name LIKE ? LIMIT 10',
      [`%${q}%`]
    );
    res.json(rows);
  } catch (error) {
    console.error('Error searching vendors:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Create vendor bill
router.post('/bills', auth, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const { vendor, products } = req.body;
    let vendorId = vendor.id;

    if (!vendorId) {
      // check if vendor exists by phone
      const [existing] = await connection.query('SELECT id FROM vendors WHERE phone = ?', [vendor.phone]);
      if (existing.length > 0) {
        vendorId = existing[0].id;
      } else {
        // create new vendor
        const [result] = await connection.query(
          'INSERT INTO vendors (name, phone) VALUES (?, ?)',
          [vendor.name, vendor.phone]
        );
        vendorId = result.insertId;
      }
    }

    // Check stock availability
    for (const p of products) {
      const [stockCheck] = await connection.query('SELECT stock_quantity FROM products WHERE id = ?', [p.id]);
      if (stockCheck.length === 0 || stockCheck[0].stock_quantity < p.quantity) {
        throw new Error(`Not enough stock for product ID ${p.id}`);
      }
    }

    let totalAmount = 0;
    products.forEach(p => {
      totalAmount += p.price * p.quantity;
    });

    const [billResult] = await connection.query(
      'INSERT INTO vendor_bills (vendor_id, total_amount) VALUES (?, ?)',
      [vendorId, totalAmount]
    );
    const billId = billResult.insertId;

    for (const p of products) {
      await connection.query(
        'INSERT INTO vendor_bill_items (vendor_bill_id, product_id, quantity, price) VALUES (?, ?, ?, ?)',
        [billId, p.id, p.quantity, p.price]
      );

      // Update product stock
      await connection.query(
        'UPDATE products SET stock_quantity = GREATEST(0, stock_quantity - ?) WHERE id = ?',
        [p.quantity, p.id]
      );

      // Update barcode number_stock (most recent barcode for this product)
      await connection.query(
        `UPDATE barcodes 
         SET number_stock = GREATEST(0, number_stock - ?) 
         WHERE barcode = (
           SELECT barcode FROM (
             SELECT barcode FROM barcodes WHERE product_id = ? ORDER BY created_at DESC LIMIT 1
           ) AS t
         )`,
        [p.quantity, p.id]
      );
    }

    await connection.commit();
    res.status(201).json({ message: 'Bill created successfully', billId });
  } catch (error) {
    await connection.rollback();
    console.error('Error creating vendor bill:', error);
    res.status(400).json({ message: error.message || 'Internal server error' });
  } finally {
    connection.release();
  }
});

// Get all vendor bills
router.get('/bills', auth, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT vb.id, vb.total_amount, vb.created_at, v.name as vendor_name, v.phone as vendor_phone
      FROM vendor_bills vb
      JOIN vendors v ON vb.vendor_id = v.id
      ORDER BY vb.created_at DESC
    `);
    res.json(rows);
  } catch (error) {
    console.error('Error fetching vendor bills:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get vendor bill items
router.get('/bills/:id/items', auth, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT vbi.quantity, vbi.price, p.name 
      FROM vendor_bill_items vbi
      JOIN products p ON vbi.product_id = p.id
      WHERE vbi.vendor_bill_id = ?
    `, [req.params.id]);
    res.json(rows);
  } catch (error) {
    console.error('Error fetching vendor bill items:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
