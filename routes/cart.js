const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');
const auth = require('../middleware/auth');

// Get user's cart items
router.get('/', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const [items] = await pool.query(`
      SELECT ci.product_id as id, ci.quantity, p.name, p.brand, p.price, p.original_price, p.image, p.category
      FROM cart_items ci
      JOIN products p ON ci.product_id = p.id
      WHERE ci.user_id = ?
    `, [userId]);

    res.json(items);
  } catch (error) {
    console.error('Error fetching cart:', error);
    res.status(500).json({ message: 'Error fetching cart items' });
  }
});

// Sync cart items (Replace all)
router.post('/sync', auth, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const userId = req.user.id;
    const { items } = req.body; // Array of { id, quantity }

    await connection.beginTransaction();

    // Clear existing cart
    await connection.query('DELETE FROM cart_items WHERE user_id = ?', [userId]);

    // Insert new items if any
    if (items && items.length > 0) {
      const values = items.map(item => [userId, item.id, item.quantity]);
      await connection.query('INSERT INTO cart_items (user_id, product_id, quantity) VALUES ?', [values]);
    }

    await connection.commit();
    res.json({ message: 'Cart synced successfully' });
  } catch (error) {
    await connection.rollback();
    console.error('Error syncing cart:', error);
    res.status(500).json({ message: 'Error syncing cart items' });
  } finally {
    connection.release();
  }
});

// Clear cart
router.delete('/', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    await pool.query('DELETE FROM cart_items WHERE user_id = ?', [userId]);
    res.json({ message: 'Cart cleared successfully' });
  } catch (error) {
    console.error('Error clearing cart:', error);
    res.status(500).json({ message: 'Error clearing cart items' });
  }
});

module.exports = router;
