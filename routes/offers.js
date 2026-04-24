const express = require('express');
const { pool } = require('../config/db');
const auth = require('../middleware/auth');

const router = express.Router();

// GET /api/offers - Get all active offers
router.get('/', async (req, res) => {
  try {
    const [offers] = await pool.query(
      'SELECT * FROM offers WHERE is_active = TRUE AND is_deleted = FALSE'
    );

    const formatted = offers.map((o) => ({
      id: o.id,
      title: o.title,
      subtitle: o.subtitle,
      color: o.color,
      code: o.code,
      type: o.discount_type,
      value: parseFloat(o.discount_value),
    }));

    res.json({ offers: formatted });
  } catch (error) {
    console.error('Get offers error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
});

// POST /api/offers - Create a new offer (Admin Only)
router.post('/', auth, async (req, res) => {
  try {
    const { title, subtitle, color, code, discount_type, discount_value } = req.body;

    if (!title || !code || !discount_type || !discount_value) {
      return res.status(400).json({ message: 'Title, code, discount type, and value are required.' });
    }

    const id = 'off_' + Math.random().toString(36).substring(2, 7);

    await pool.query(
      'INSERT INTO offers (id, title, subtitle, color, code, discount_type, discount_value) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, title, subtitle, color || '#FF4500', code.toUpperCase(), discount_type, discount_value]
    );

    res.status(201).json({ message: 'Offer created successfully!', offerId: id });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'An offer with this code already exists.' });
    }
    console.error('Create offer error:', error);
    res.status(500).json({ message: 'Server error. Please try again.' });
  }
});

// PUT /api/offers/:id - Update offer
router.put('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, subtitle, color, code, discount_type, discount_value, is_active } = req.body;

    await pool.query(
      'UPDATE offers SET title = ?, subtitle = ?, color = ?, code = ?, discount_type = ?, discount_value = ?, is_active = ? WHERE id = ?',
      [title, subtitle, color, code.toUpperCase(), discount_type, discount_value, is_active !== undefined ? is_active : true, id]
    );

    res.json({ message: 'Offer updated successfully!' });
  } catch (error) {
    console.error('Update offer error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
});

// DELETE /api/offers/:id - Soft delete offer
router.delete('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('UPDATE offers SET is_deleted = TRUE WHERE id = ?', [id]);
    res.json({ message: 'Offer deleted successfully!' });
  } catch (error) {
    console.error('Delete offer error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
});

// POST /api/offers/validate - Validate a coupon code
router.post('/validate', async (req, res) => {
  try {
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({ message: 'Coupon code is required.' });
    }

    const [offers] = await pool.query(
      'SELECT * FROM offers WHERE code = ? AND is_active = TRUE AND is_deleted = FALSE',
      [code.toUpperCase()]
    );

    if (offers.length === 0) {
      return res.status(404).json({ valid: false, message: 'Invalid coupon code.' });
    }

    const offer = offers[0];
    res.json({
      valid: true,
      coupon: {
        code: offer.code,
        type: offer.discount_type,
        value: parseFloat(offer.discount_value),
      },
    });
  } catch (error) {
    console.error('Validate coupon error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
});

// GET /api/offers/admin - Get all offers for admin (including inactive, excluding deleted)
router.get('/admin', auth, async (req, res) => {
  try {
    const [offers] = await pool.query('SELECT * FROM offers WHERE is_deleted = FALSE ORDER BY id DESC');
    res.json(offers);
  } catch (error) {
    console.error('Admin get offers error:', error);
    res.status(500).json({ message: 'Server error. Please try again.' });
  }
});

module.exports = router;
