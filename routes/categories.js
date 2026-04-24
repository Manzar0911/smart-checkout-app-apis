const express = require('express');
const { pool } = require('../config/db');

const router = express.Router();

// GET /api/categories
router.get('/', async (req, res) => {
  try {
    const [categories] = await pool.query('SELECT * FROM categories ORDER BY name');
    res.json({ categories });
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
});

// POST /api/categories
router.post('/', async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ message: 'Category name is required.' });

  try {
    const [existing] = await pool.query('SELECT * FROM categories WHERE name = ?', [name]);
    if (existing.length > 0) {
      return res.json({ category: existing[0] });
    }

    const [result] = await pool.query('INSERT INTO categories (name) VALUES (?)', [name]);
    res.status(201).json({
      category: {
        id: result.insertId,
        name
      }
    });
  } catch (error) {
    console.error('Create category error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
});

module.exports = router;
