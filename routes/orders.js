const express = require('express');
const { pool } = require('../config/db');
const auth = require('../middleware/auth');

const router = express.Router();

// POST /api/orders - Create a new order
router.post('/', auth, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { items, subtotal, discount, couponCode, total, paymentMethod, transactionId, customerPhone, customerName } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ message: 'Order must have at least one item.' });
    }

    // Generate order ID
    const orderId = 'RCP-' + Math.random().toString(36).substring(2, 9).toUpperCase();

    await connection.beginTransaction();

    let targetUserId = req.user.id;
    let createdBy = null;

    // Fetch the role of the current user
    const [currentUser] = await connection.query('SELECT role FROM users WHERE id = ?', [req.user.id]);
    const role = currentUser[0]?.role;

    if ((role === 'admin' || role === 'employee') && customerPhone) {
      createdBy = req.user.id; // Admin/Employee is creating the bill
      
      // Check if customer phone exists
      const [existingUsers] = await connection.query('SELECT id FROM users WHERE phone = ?', [customerPhone]);
      if (existingUsers.length > 0) {
        targetUserId = existingUsers[0].id;
      } else {
        // Create new user for the customer
        const [result] = await connection.query(
          'INSERT INTO users (phone, name, is_profile_complete) VALUES (?, ?, FALSE)',
          [customerPhone, customerName || null]
        );
        targetUserId = result.insertId;
      }
    }

    // Insert order
    await connection.query(
      `INSERT INTO orders (id, user_id, subtotal, discount, coupon_code, total, payment_method, transaction_id, status, is_verified, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'paid', FALSE, ?)`,
      [orderId, targetUserId, subtotal, discount || 0, couponCode || null, total, paymentMethod, transactionId, createdBy]
    );

    // Insert order items and update stock
    for (const item of items) {
      await connection.query(
        'INSERT INTO order_items (order_id, product_id, quantity, price) VALUES (?, ?, ?, ?)',
        [orderId, item.id, item.quantity, item.price]
      );

      // Update product stock
      await connection.query(
        'UPDATE products SET stock_quantity = GREATEST(0, stock_quantity - ?) WHERE id = ?',
        [item.quantity, item.id]
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
        [item.quantity, item.id]
      );
    }

    await connection.commit();

    // Return the created order
    const now = new Date();
    res.status(201).json({
      message: 'Order created successfully!',
      order: {
        id: orderId,
        date: now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
        time: now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
        items,
        subtotal,
        discount: discount || 0,
        coupon: couponCode || null,
        total,
        itemCount: items.reduce((sum, i) => sum + i.quantity, 0),
        paymentMethod: { name: paymentMethod },
        transactionId,
        status: 'paid',
        isVerified: false,
      },
    });
  } catch (error) {
    await connection.rollback();
    console.error('Create order error:', error);
    res.status(500).json({ message: 'Failed to create order.' });
  } finally {
    connection.release();
  }
});

// GET /api/orders - Get user's order history
router.get('/', auth, async (req, res) => {
  try {
    const [orders] = await pool.query(
      `SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC`,
      [req.user.id]
    );

    const ordersWithItems = await Promise.all(
      orders.map(async (order) => {
        const [items] = await pool.query(
          `SELECT oi.*, p.name, p.brand, p.image, p.original_price
           FROM order_items oi
           JOIN products p ON oi.product_id = p.id
           WHERE oi.order_id = ?`,
          [order.id]
        );

        const createdAt = new Date(order.created_at);

        return {
          id: order.id,
          date: createdAt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
          time: createdAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
          items: items.map((i) => ({
            id: i.product_id,
            name: i.name,
            brand: i.brand,
            image: i.image,
            price: parseFloat(i.price),
            originalPrice: parseFloat(i.original_price),
            quantity: i.quantity,
          })),
          subtotal: parseFloat(order.subtotal),
          discount: parseFloat(order.discount),
          coupon: order.coupon_code,
          total: parseFloat(order.total),
          itemCount: items.reduce((sum, i) => sum + i.quantity, 0),
          paymentMethod: { name: order.payment_method },
          transactionId: order.transaction_id,
          status: order.status,
          isVerified: !!order.is_verified,
        };
      })
    );

    res.json({ orders: ordersWithItems });
  } catch (error) {
    console.error('Get orders error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
});

// GET /api/orders/:id - Get single order
router.get('/:id', auth, async (req, res) => {
  try {
    const [orders] = await pool.query(
      'SELECT * FROM orders WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    );

    if (orders.length === 0) {
      return res.status(404).json({ message: 'Order not found.' });
    }

    const order = orders[0];
    const [items] = await pool.query(
      `SELECT oi.*, p.name, p.brand, p.image, p.original_price
       FROM order_items oi
       JOIN products p ON oi.product_id = p.id
       WHERE oi.order_id = ?`,
      [order.id]
    );

    const createdAt = new Date(order.created_at);

    res.json({
      order: {
        id: order.id,
        date: createdAt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
        time: createdAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
        items: items.map((i) => ({
          id: i.product_id,
          name: i.name,
          brand: i.brand,
          image: i.image,
          price: parseFloat(i.price),
          originalPrice: parseFloat(i.original_price),
          quantity: i.quantity,
        })),
        subtotal: parseFloat(order.subtotal),
        discount: parseFloat(order.discount),
        coupon: order.coupon_code,
        total: parseFloat(order.total),
        itemCount: items.reduce((sum, i) => sum + i.quantity, 0),
        paymentMethod: { name: order.payment_method },
        transactionId: order.transaction_id,
        status: order.status,
        isVerified: !!order.is_verified,
      },
    });
  } catch (error) {
    console.error('Get order error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
});

// GET /api/orders/verify/:id - Get order for guard verification
router.get('/verify/:id', auth, async (req, res) => {
  try {
    // Note: We might want to check if req.user has guard or admin role here
    const [orders] = await pool.query(
      'SELECT * FROM orders WHERE id = ?',
      [req.params.id]
    );

    if (orders.length === 0) {
      return res.status(404).json({ message: 'Order not found.' });
    }

    const order = orders[0];
    const [items] = await pool.query(
      `SELECT oi.*, p.name, p.brand, p.image, p.original_price
       FROM order_items oi
       JOIN products p ON oi.product_id = p.id
       WHERE oi.order_id = ?`,
      [order.id]
    );

    const createdAt = new Date(order.created_at);

    res.json({
      order: {
        id: order.id,
        date: createdAt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
        time: createdAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
        items: items.map((i) => ({
          id: i.product_id,
          name: i.name,
          brand: i.brand,
          image: i.image,
          price: parseFloat(i.price),
          originalPrice: parseFloat(i.original_price),
          quantity: i.quantity,
        })),
        subtotal: parseFloat(order.subtotal),
        discount: parseFloat(order.discount),
        coupon: order.coupon_code,
        total: parseFloat(order.total),
        itemCount: items.reduce((sum, i) => sum + i.quantity, 0),
        paymentMethod: { name: order.payment_method },
        transactionId: order.transaction_id,
        status: order.status,
        isVerified: !!order.is_verified,
      },
    });
  } catch (error) {
    console.error('Get order for verification error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
});

// PUT /api/orders/verify/:id - Mark order as verified
router.put('/verify/:id', auth, async (req, res) => {
  try {
    const [result] = await pool.query(
      "UPDATE orders SET status = 'verified', is_verified = TRUE WHERE id = ?",
      [req.params.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Order not found.' });
    }

    res.json({ message: 'Order verified successfully' });
  } catch (error) {
    console.error('Verify order error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
});

module.exports = router;
