const express = require('express');
const { pool } = require('../config/db');
const auth = require('../middleware/auth');
const { validateFlexibleDate, compareFlexibleDates, parseFlexibleDate, safeDateType } = require('../utils/dateValidation');

const router = express.Router();

// ─── Helper: safe barcode source ───
const VALID_BARCODE_SOURCES = ['generated', 'mapped_existing'];
const safeSource = (source) => VALID_BARCODE_SOURCES.includes(source) ? source : 'generated';

// ─── Helper: validate barcode value ───
const validateBarcodeValue = (value) => {
  if (!value || (typeof value === 'string' && value.trim() === '')) {
    return { valid: false, error: 'Barcode value is required.' };
  }
  const trimmed = String(value).trim();
  if (trimmed.length === 0) {
    return { valid: false, error: 'Barcode value cannot be empty.' };
  }
  if (trimmed.length > 50) {
    return { valid: false, error: 'Barcode value is too long (max 50 characters).' };
  }
  // Allow alphanumeric, dashes, dots (common barcode characters)
  if (!/^[a-zA-Z0-9\-\.]+$/.test(trimmed)) {
    return { valid: false, error: 'Barcode contains invalid characters. Only alphanumeric, dashes, and dots allowed.' };
  }
  return { valid: true, error: null, value: trimmed };
};

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
      expiryDate: parseFlexibleDate(p.expiry_date, safeDateType(p.expiry_date_type)),
      expiryDateType: safeDateType(p.expiry_date_type),
      manufacturingDate: parseFlexibleDate(p.mfg_date, safeDateType(p.mfg_date_type)),
      manufacturingDateType: safeDateType(p.mfg_date_type),
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

// ══════════════════════════════════════════════════════════════
// MAP EXISTING BARCODE ENDPOINTS
// These MUST be defined BEFORE the /:barcode route
// ══════════════════════════════════════════════════════════════

// POST /api/products/map-barcode - Map an existing barcode to a product
router.post('/map-barcode', auth, async (req, res) => {
  try {
    const {
      productId,
      barcodeValue,
      manufacturing_date,
      manufacturing_date_type,
      expiry_date,
      expiry_date_type,
    } = req.body;

    // ── Validate product ID ──
    if (!productId) {
      return res.status(400).json({ message: 'Product ID is required.' });
    }

    // ── Validate barcode value ──
    const barcodeValidation = validateBarcodeValue(barcodeValue);
    if (!barcodeValidation.valid) {
      return res.status(400).json({ message: barcodeValidation.error });
    }
    const cleanBarcode = barcodeValidation.value;

    // ── Validate product exists ──
    const [products] = await pool.query(
      'SELECT id, name FROM products WHERE id = ? AND is_deleted = FALSE',
      [productId]
    );
    if (products.length === 0) {
      return res.status(404).json({ message: 'Product not found.' });
    }

    // ── Validate flexible dates ──
    const safeMfgType = safeDateType(manufacturing_date_type);
    const safeExpType = safeDateType(expiry_date_type);

    if (manufacturing_date) {
      const mfgValidation = validateFlexibleDate(manufacturing_date, safeMfgType);
      if (!mfgValidation.valid) {
        return res.status(400).json({ message: `Manufacturing date: ${mfgValidation.error}` });
      }
    }

    if (expiry_date) {
      const expValidation = validateFlexibleDate(expiry_date, safeExpType);
      if (!expValidation.valid) {
        return res.status(400).json({ message: `Expiry date: ${expValidation.error}` });
      }
    }

    // ── Cross-validate: expiry not before manufacturing ──
    if (manufacturing_date && expiry_date) {
      const comparison = compareFlexibleDates(manufacturing_date, safeMfgType, expiry_date, safeExpType);
      if (!comparison.valid) {
        return res.status(400).json({ message: comparison.error });
      }
    }

    // ── Check for duplicate barcode ──
    const [existingBarcodes] = await pool.query(
      'SELECT barcode, product_id FROM barcodes WHERE barcode = ?',
      [cleanBarcode]
    );

    if (existingBarcodes.length > 0) {
      const existing = existingBarcodes[0];
      if (String(existing.product_id) === String(productId)) {
        return res.status(409).json({
          message: 'This barcode is already mapped to this product.',
          code: 'DUPLICATE_SAME_PRODUCT',
        });
      } else {
        return res.status(409).json({
          message: 'This barcode is already mapped to another product.',
          code: 'DUPLICATE_DIFFERENT_PRODUCT',
        });
      }
    }

    // ── Insert barcode mapping ──
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      await connection.query(
        `INSERT INTO barcodes (barcode, product_id, mfg_date, mfg_date_type, expiry_date, expiry_date_type, quantity, number_stock, barcode_source)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [cleanBarcode, productId, manufacturing_date || null, safeMfgType, expiry_date || null, safeExpType, 0, 0, 'mapped_existing']
      );

      await connection.commit();

      res.status(201).json({
        message: 'Barcode mapped successfully!',
        barcode: cleanBarcode,
        productId: productId,
        productName: products[0].name,
        barcodeSource: 'mapped_existing',
      });
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Map barcode error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
});

// GET /api/products/barcodes/list - Get all barcodes with product details (admin)
router.get('/barcodes/list', auth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const search = req.query.search || '';
    const type = req.query.type || 'all';
    const offset = (page - 1) * limit;

    let baseQuery = 'FROM barcodes b JOIN products p ON b.product_id = p.id WHERE p.is_deleted = FALSE';
    const queryParams = [];

    if (search) {
      baseQuery += ' AND (p.name LIKE ? OR b.barcode LIKE ?)';
      queryParams.push(`%${search}%`, `%${search}%`);
    }

    if (type === 'generated') {
      baseQuery += " AND b.barcode_source = 'generated'";
    } else if (type === 'mapped') {
      baseQuery += " AND b.barcode_source = 'mapped_existing'";
    }

    const [barcodes] = await pool.query(
      `SELECT b.barcode, b.product_id, b.mfg_date, b.mfg_date_type, b.expiry_date, b.expiry_date_type,
              b.barcode_source, b.quantity, b.number_stock, b.created_at,
              p.name as product_name, p.brand as product_brand
       ${baseQuery}
       ORDER BY b.created_at DESC
       LIMIT ? OFFSET ?`,
      [...queryParams, limit, offset]
    );

    const [countResult] = await pool.query(
      `SELECT COUNT(*) as total ${baseQuery}`,
      queryParams
    );

    const formatted = barcodes.map((b) => ({
      barcode: b.barcode,
      productId: b.product_id,
      productName: b.product_name,
      productBrand: b.product_brand,
      manufacturingDate: parseFlexibleDate(b.mfg_date, safeDateType(b.mfg_date_type)),
      manufacturingDateType: safeDateType(b.mfg_date_type),
      expiryDate: parseFlexibleDate(b.expiry_date, safeDateType(b.expiry_date_type)),
      expiryDateType: safeDateType(b.expiry_date_type),
      barcodeSource: safeSource(b.barcode_source),
      quantity: b.quantity,
      stock: b.number_stock,
      createdAt: b.created_at,
    }));

    res.json({
      barcodes: formatted,
      pagination: {
        page,
        limit,
        total: countResult[0].total,
        totalPages: Math.ceil(countResult[0].total / limit),
      },
    });
  } catch (error) {
    console.error('Get barcodes list error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
});

// PUT /api/products/barcode/:barcode - Edit a barcode record
router.put('/barcode/:barcode', auth, async (req, res) => {
  try {
    const { barcode } = req.params;
    const {
      productId,
      newBarcodeValue,
      manufacturing_date,
      manufacturing_date_type,
      expiry_date,
      expiry_date_type,
    } = req.body;

    // ── Verify barcode exists ──
    const [existing] = await pool.query('SELECT * FROM barcodes WHERE barcode = ?', [barcode]);
    if (existing.length === 0) {
      return res.status(404).json({ message: 'Barcode not found.' });
    }

    // ── If changing barcode value, validate and check duplicates ──
    let finalBarcode = barcode;
    if (newBarcodeValue && newBarcodeValue !== barcode) {
      const barcodeValidation = validateBarcodeValue(newBarcodeValue);
      if (!barcodeValidation.valid) {
        return res.status(400).json({ message: barcodeValidation.error });
      }
      finalBarcode = barcodeValidation.value;

      // Check for duplicates with new value
      const [duplicates] = await pool.query(
        'SELECT barcode, product_id FROM barcodes WHERE barcode = ?',
        [finalBarcode]
      );
      if (duplicates.length > 0) {
        return res.status(409).json({ message: 'The new barcode value is already in use.' });
      }
    }

    // ── If changing product, validate it exists ──
    const finalProductId = productId || existing[0].product_id;
    if (productId) {
      const [products] = await pool.query(
        'SELECT id FROM products WHERE id = ? AND is_deleted = FALSE',
        [productId]
      );
      if (products.length === 0) {
        return res.status(404).json({ message: 'Product not found.' });
      }
    }

    // ── Validate flexible dates ──
    const safeMfgType = safeDateType(manufacturing_date_type || existing[0].mfg_date_type);
    const safeExpType = safeDateType(expiry_date_type || existing[0].expiry_date_type);
    const finalMfgDate = manufacturing_date !== undefined ? manufacturing_date : existing[0].mfg_date;
    const finalExpDate = expiry_date !== undefined ? expiry_date : existing[0].expiry_date;

    if (finalMfgDate) {
      const mfgValidation = validateFlexibleDate(finalMfgDate, safeMfgType);
      if (!mfgValidation.valid) {
        return res.status(400).json({ message: `Manufacturing date: ${mfgValidation.error}` });
      }
    }

    if (finalExpDate) {
      const expValidation = validateFlexibleDate(finalExpDate, safeExpType);
      if (!expValidation.valid) {
        return res.status(400).json({ message: `Expiry date: ${expValidation.error}` });
      }
    }

    if (finalMfgDate && finalExpDate) {
      const comparison = compareFlexibleDates(finalMfgDate, safeMfgType, finalExpDate, safeExpType);
      if (!comparison.valid) {
        return res.status(400).json({ message: comparison.error });
      }
    }

    // ── Update barcode record ──
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      await connection.query(
        `UPDATE barcodes SET barcode = ?, product_id = ?, mfg_date = ?, mfg_date_type = ?, expiry_date = ?, expiry_date_type = ?
         WHERE barcode = ?`,
        [finalBarcode, finalProductId, finalMfgDate || null, safeMfgType, finalExpDate || null, safeExpType, barcode]
      );

      await connection.commit();

      res.json({
        message: 'Barcode updated successfully!',
        barcode: finalBarcode,
        productId: finalProductId,
      });
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Update barcode error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
});

// DELETE /api/products/barcode/:barcode - Delete a barcode record
router.delete('/barcode/:barcode', auth, async (req, res) => {
  try {
    const { barcode } = req.params;

    // Verify barcode exists
    const [existing] = await pool.query('SELECT barcode, product_id FROM barcodes WHERE barcode = ?', [barcode]);
    if (existing.length === 0) {
      return res.status(404).json({ message: 'Barcode not found.' });
    }

    // Delete barcode record (does NOT affect the product)
    await pool.query('DELETE FROM barcodes WHERE barcode = ?', [barcode]);

    res.json({
      message: 'Barcode deleted successfully!',
      barcode: barcode,
    });
  } catch (error) {
    console.error('Delete barcode error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
});

// GET /api/products/:barcode - Get product by barcode (SCANNER ENDPOINT)
// Works for BOTH generated and mapped_existing barcodes
router.get('/:barcode', async (req, res) => {
  try {
    const { barcode } = req.params;

    const [barcodes] = await pool.query(
      `SELECT b.*, b.mfg_date_type as b_mfg_date_type, b.expiry_date_type as b_expiry_date_type,
              b.barcode_source,
              p.name, p.brand, p.price, p.original_price, p.image, p.ingredients, p.packaging, 
              p.expiry_date as p_expiry_date, p.category, p.weight, p.stock_quantity
       FROM barcodes b 
       JOIN products p ON b.product_id = p.id 
       WHERE b.barcode = ? AND p.is_deleted = FALSE`,
      [barcode]
    );

    if (barcodes.length === 0) {
      return res.status(404).json({ message: 'Product not found.' });
    }

    const product = barcodes[0];

    // Use barcode-level date info (more specific), fall back to product-level
    const mfgDateType = safeDateType(product.b_mfg_date_type);
    const expiryDateType = safeDateType(product.b_expiry_date_type);

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
        manufacturingDate: parseFlexibleDate(product.mfg_date, mfgDateType),
        manufacturingDateType: mfgDateType,
        expiryDate: parseFlexibleDate(product.expiry_date, expiryDateType),
        expiryDateType: expiryDateType,
        category: product.category,
        weight: product.weight,
        stockQuantity: product.number_stock,
        barcodeSource: safeSource(product.barcode_source),
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
    const { mfgDate, expiryDate, stockQuantity = 0, mfgDateType, expiryDateType } = req.body;

    // Determine date types with safe fallback
    const safeMfgType = safeDateType(mfgDateType);
    const safeExpType = safeDateType(expiryDateType);

    // Validate manufacturing date
    if (mfgDate) {
      const mfgValidation = validateFlexibleDate(mfgDate, safeMfgType);
      if (!mfgValidation.valid) {
        return res.status(400).json({ message: `Manufacturing date: ${mfgValidation.error}` });
      }
    }

    // Validate expiry date
    if (expiryDate) {
      const expValidation = validateFlexibleDate(expiryDate, safeExpType);
      if (!expValidation.valid) {
        return res.status(400).json({ message: `Expiry date: ${expValidation.error}` });
      }
    }

    // Cross-validate: expiry must not be before manufacturing
    if (mfgDate && expiryDate) {
      const comparison = compareFlexibleDates(mfgDate, safeMfgType, expiryDate, safeExpType);
      if (!comparison.valid) {
        return res.status(400).json({ message: comparison.error });
      }
    }

    const barcode = Math.floor(100000000000 + Math.random() * 900000000000).toString();

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      await connection.query(
        'INSERT INTO barcodes (barcode, product_id, mfg_date, mfg_date_type, expiry_date, expiry_date_type, quantity, number_stock, barcode_source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [barcode, id, mfgDate || null, safeMfgType, expiryDate || null, safeExpType, stockQuantity, stockQuantity, 'generated']
      );

      await connection.query(
        'UPDATE products SET stock_quantity = stock_quantity + ?, mfg_date = ?, mfg_date_type = ?, expiry_date = ?, expiry_date_type = ? WHERE id = ?',
        [stockQuantity, mfgDate || null, safeMfgType, expiryDate || null, safeExpType, id]
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
