const express = require('express');
const { pool } = require('../config/db');
const auth = require('../middleware/auth');

const router = express.Router();

// GET /api/products - Get all products
router.get('/', async (req, res) => {
  try {
    const [products] = await pool.query(
      'SELECT p.*, c.name as category_name FROM products p LEFT JOIN categories c ON p.category_id = c.id WHERE p.is_deleted = FALSE'
    );

    const formatted = products.map((p) => ({
      id: p.id,
      name: p.name,
      brand: p.brand,
      price: parseFloat(p.price),
      originalPrice: parseFloat(p.original_price),
      discount: p.discount,
      image: p.image,
      ingredients: p.ingredients,
      packaging: p.packaging,
      expiryDate: p.expiry_date,
      category: p.category_name || p.category,
      categoryId: p.category_id,
      weight: p.weight,
      stockQuantity: p.stock_quantity || 0,
      isActive: p.is_active,
    }));

    res.json({ products: formatted });
  } catch (error) {
    console.error('Get products error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
});

// GET /api/products/:barcode - Get product by barcode
router.get('/:barcode', async (req, res) => {
  try {
    const { barcode } = req.params;

    const [barcodes] = await pool.query(
      'SELECT b.*, p.name, p.brand, p.price, p.original_price, p.image, p.ingredients, p.packaging, p.expiry_date, p.category, p.weight FROM barcodes b JOIN products p ON b.product_id = p.id WHERE b.barcode = ? AND p.is_deleted = FALSE',
      [barcode]
    );

    if (barcodes.length === 0) {
      return res.status(404).json({ message: 'Product not found.' });
    }

    const product = barcodes[0];
    res.json({
      product: {
        barcode: product.barcode,
        id: product.product_id,
        name: product.name,
        brand: product.brand,
        price: parseFloat(product.price),
        originalPrice: parseFloat(product.original_price),
        image: product.image,
        ingredients: product.ingredients,
        packaging: product.packaging,
        expiryDate: product.expiry_date,
        category: product.category,
        weight: product.weight,
        stockQuantity: product.number_stock,
      },
    });
  } catch (error) {
    console.error('Get product by barcode error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
});

// POST /api/products - Add new product
router.post('/', auth, async (req, res) => {
  try {
    const { name, brand, price, originalPrice, discount, categoryName, categoryId, weight, image } = req.body;

    if (!name || !brand || !price) {
      return res.status(400).json({ message: 'Name, brand, and price are required.' });
    }

    let finalCategoryId = categoryId;
    if (!finalCategoryId && categoryName) {
      const [existingCat] = await pool.query('SELECT id FROM categories WHERE name = ?', [categoryName]);
      if (existingCat.length > 0) {
        finalCategoryId = existingCat[0].id;
      } else {
        const [newCat] = await pool.query('INSERT INTO categories (name) VALUES (?)', [categoryName]);
        finalCategoryId = newCat.insertId;
      }
    }

    const [result] = await pool.query(
      'INSERT INTO products (name, brand, price, original_price, discount, category, category_id, weight, image) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [name, brand, price, originalPrice || price, discount || 0, categoryName, finalCategoryId, weight, image]
    );

    res.status(201).json({ message: 'Product added successfully!', productId: result.insertId });
  } catch (error) {
    console.error('Add product error:', error);
    res.status(500).json({ message: 'Server error. Please try again.' });
  }
});

// PUT /api/products/:id - Update product
router.put('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, brand, price, originalPrice, discount, categoryName, categoryId, weight, image, isActive } = req.body;

    let finalCategoryId = categoryId;
    if (!finalCategoryId && categoryName) {
      const [existingCat] = await pool.query('SELECT id FROM categories WHERE name = ?', [categoryName]);
      if (existingCat.length > 0) {
        finalCategoryId = existingCat[0].id;
      } else {
        const [newCat] = await pool.query('INSERT INTO categories (name) VALUES (?)', [categoryName]);
        finalCategoryId = newCat.insertId;
      }
    }

    await pool.query(
      'UPDATE products SET name = ?, brand = ?, price = ?, original_price = ?, discount = ?, category = ?, category_id = ?, weight = ?, image = ?, is_active = ? WHERE id = ?',
      [name, brand, price, originalPrice || price, discount || 0, categoryName, finalCategoryId, weight, image, isActive !== undefined ? isActive : true, id]
    );

    res.json({ message: 'Product updated successfully!' });
  } catch (error) {
    console.error('Update product error:', error);
    res.status(500).json({ message: 'Server error. Please try again.' });
  }
});

// DELETE /api/products/:id - Soft delete product
router.delete('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('UPDATE products SET is_deleted = TRUE WHERE id = ?', [id]);
    res.json({ message: 'Product deleted successfully!' });
  } catch (error) {
    console.error('Delete product error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
});

// POST /api/products/:id/barcode - Generate barcode and update stock
router.post('/:id/barcode', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { mfgDate, expiryDate, stockQuantity } = req.body;

    const barcode = Math.floor(100000000000 + Math.random() * 900000000000).toString();

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      await connection.query(
        'INSERT INTO barcodes (barcode, product_id, mfg_date, expiry_date, quantity, number_stock) VALUES (?, ?, ?, ?, ?, ?)',
        [barcode, id, mfgDate, expiryDate, stockQuantity, stockQuantity]
      );

      await connection.query(
        'UPDATE products SET stock_quantity = stock_quantity + ?, mfg_date = ? WHERE id = ?',
        [stockQuantity, mfgDate, id]
      );

      await connection.commit();
      res.status(201).json({ message: 'Barcode generated!', barcode });
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Barcode generation error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
});

module.exports = router;
