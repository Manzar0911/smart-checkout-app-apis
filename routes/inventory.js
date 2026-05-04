const express = require('express');
const { pool } = require('../config/db');
const auth = require('../middleware/auth');

const router = express.Router();

// Helper: verify admin role
const verifyAdmin = async (userId) => {
  const [rows] = await pool.query('SELECT role FROM users WHERE id = ?', [userId]);
  return rows.length > 0 && rows[0].role === 'admin';
};

// GET /api/inventory/products - Get all active products for inventory management
router.get('/products', auth, async (req, res) => {
  try {
    if (!(await verifyAdmin(req.user.id))) {
      return res.status(403).json({ message: 'Access denied. Admin only.' });
    }

    const [products] = await pool.query(
      'SELECT id, name, brand, weight, stock_quantity FROM products WHERE is_deleted = FALSE ORDER BY name ASC'
    );

    const formatted = products.map((p) => ({
      id: p.id,
      name: p.name,
      brand: p.brand,
      weight: p.weight,
      stockQuantity: p.stock_quantity || 0,
    }));

    res.json({ products: formatted });
  } catch (error) {
    console.error('Get inventory products error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
});

// POST /api/inventory/update - Adjust stock quantity (ADD or REMOVE)
router.post('/update', auth, async (req, res) => {
  try {
    if (!(await verifyAdmin(req.user.id))) {
      return res.status(403).json({ message: 'Access denied. Admin only.' });
    }

    const { productId, quantity, actionType } = req.body;

    // Validate input
    if (!productId || !quantity || !actionType) {
      return res.status(400).json({ message: 'Product ID, quantity, and action type are required.' });
    }

    const parsedQuantity = parseInt(quantity);
    if (isNaN(parsedQuantity) || parsedQuantity <= 0) {
      return res.status(400).json({ message: 'Quantity must be a positive number.' });
    }

    if (!['ADD', 'REMOVE'].includes(actionType)) {
      return res.status(400).json({ message: 'Action type must be ADD or REMOVE.' });
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Get current product info with lock to prevent race conditions
      const [products] = await connection.query(
        'SELECT id, name, stock_quantity FROM products WHERE id = ? AND is_deleted = FALSE FOR UPDATE',
        [productId]
      );

      if (products.length === 0) {
        await connection.rollback();
        return res.status(404).json({ message: 'Product not found.' });
      }

      const product = products[0];
      const previousQuantity = product.stock_quantity || 0;

      // Calculate new quantity
      let newQuantity;
      if (actionType === 'ADD') {
        newQuantity = previousQuantity + parsedQuantity;
      } else {
        newQuantity = previousQuantity - parsedQuantity;
      }

      // Prevent negative stock
      if (newQuantity < 0) {
        await connection.rollback();
        return res.status(400).json({
          message: `Cannot remove ${parsedQuantity} units. Current stock is only ${previousQuantity}.`,
        });
      }

      // Update product stock
      await connection.query(
        'UPDATE products SET stock_quantity = ? WHERE id = ?',
        [newQuantity, productId]
      );

      // Create inventory log entry
      await connection.query(
        `INSERT INTO inventory_logs 
         (product_id, product_name, previous_quantity, changed_quantity, new_quantity, action_type, admin_id) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [productId, product.name, previousQuantity, parsedQuantity, newQuantity, actionType, req.user.id]
      );

      await connection.commit();

      res.json({
        message: `Stock ${actionType === 'ADD' ? 'increased' : 'decreased'} successfully!`,
        previousQuantity,
        changedQuantity: parsedQuantity,
        newQuantity,
        actionType,
      });
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Update inventory error:', error);
    res.status(500).json({ message: 'Server error. Please try again.' });
  }
});

// GET /api/inventory/history - Get inventory adjustment history
router.get('/history', auth, async (req, res) => {
  try {
    if (!(await verifyAdmin(req.user.id))) {
      return res.status(403).json({ message: 'Access denied. Admin only.' });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const productId = req.query.productId;

    let query = `
      SELECT il.*, u.name as admin_name 
      FROM inventory_logs il 
      LEFT JOIN users u ON il.admin_id = u.id
    `;
    let countQuery = 'SELECT COUNT(*) as total FROM inventory_logs';
    const params = [];
    const countParams = [];

    if (productId) {
      query += ' WHERE il.product_id = ?';
      countQuery += ' WHERE product_id = ?';
      params.push(productId);
      countParams.push(productId);
    }

    query += ' ORDER BY il.created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const [logs] = await pool.query(query, params);
    const [countResult] = await pool.query(countQuery, countParams);
    const total = countResult[0].total;

    const formatted = logs.map((log) => ({
      id: log.id,
      productId: log.product_id,
      productName: log.product_name,
      previousQuantity: log.previous_quantity,
      changedQuantity: log.changed_quantity,
      newQuantity: log.new_quantity,
      actionType: log.action_type,
      adminId: log.admin_id,
      adminName: log.admin_name || 'Unknown',
      createdAt: log.created_at,
    }));

    res.json({
      logs: formatted,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Get inventory history error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
});

module.exports = router;
