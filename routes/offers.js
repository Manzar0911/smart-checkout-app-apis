const express = require('express');
const { pool } = require('../config/db');
const auth = require('../middleware/auth');

const router = express.Router();

// ─── Helper: Format offer row ───────────────────────────────────────────────
const formatOffer = (o) => ({
  id: o.id,
  title: o.title,
  subtitle: o.subtitle,
  color: o.color,
  code: o.code,
  offer_type: o.offer_type || 'coupon',
  // Coupon fields
  discount_type: o.discount_type,
  discount_value: parseFloat(o.discount_value) || 0,
  // BXGY fields
  buy_product_id: o.buy_product_id,
  buy_product_name: o.buy_product_name || null,
  buy_product_price: o.buy_product_price ? parseFloat(o.buy_product_price) : null,
  buy_quantity: o.buy_quantity || 1,
  get_product_id: o.get_product_id,
  get_product_name: o.get_product_name || null,
  get_product_price: o.get_product_price ? parseFloat(o.get_product_price) : null,
  get_product_brand: o.get_product_brand || null,
  get_product_image: o.get_product_image || null,
  get_quantity: o.get_quantity || 1,
  allow_stacking: !!o.allow_stacking,
  max_free_qty_per_order: o.max_free_qty_per_order || null,
  max_usage_per_user: o.max_usage_per_user || null,
  max_usage_total: o.max_usage_total || null,
  usage_count: o.usage_count || 0,
  priority: o.priority || 0,
  is_active: !!o.is_active,
});

const BXGY_OFFER_JOIN = `
  SELECT o.*,
    bp.name AS buy_product_name, bp.price AS buy_product_price,
    gp.name AS get_product_name, gp.price AS get_product_price, 
    gp.brand AS get_product_brand, gp.image AS get_product_image
  FROM offers o
  LEFT JOIN products bp ON o.buy_product_id = bp.id
  LEFT JOIN products gp ON o.get_product_id = gp.id
`;

// ─── GET /api/offers — Active offers for customers ───────────────────────────
router.get('/', async (req, res) => {
  try {
    const [offers] = await pool.query(
      `${BXGY_OFFER_JOIN} WHERE o.is_active = TRUE AND o.is_deleted = FALSE`
    );
    res.json({ offers: offers.map(formatOffer) });
  } catch (error) {
    console.error('Get offers error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
});

// ─── GET /api/offers/admin — All offers for admin ────────────────────────────
router.get('/admin', auth, async (req, res) => {
  try {
    const [offers] = await pool.query(
      `${BXGY_OFFER_JOIN} WHERE o.is_deleted = FALSE ORDER BY o.priority DESC, o.id DESC`
    );
    res.json(offers.map(formatOffer));
  } catch (error) {
    console.error('Admin get offers error:', error);
    res.status(500).json({ message: 'Server error. Please try again.' });
  }
});

// ─── POST /api/offers — Create offer ─────────────────────────────────────────
router.post('/', auth, async (req, res) => {
  try {
    const {
      title, subtitle, color, code,
      offer_type = 'coupon',
      // Coupon fields
      discount_type, discount_value,
      // BXGY fields
      buy_product_id, buy_quantity, get_product_id, get_quantity,
      allow_stacking = true, max_free_qty_per_order, priority = 0,
      max_usage_per_user, max_usage_total,
    } = req.body;

    if (!title || !code) {
      return res.status(400).json({ message: 'Title and code are required.' });
    }

    if (offer_type === 'coupon') {
      if (!discount_type || !discount_value) {
        return res.status(400).json({ message: 'Discount type and value are required for coupon offers.' });
      }
    } else if (offer_type === 'buy_x_get_y') {
      if (!buy_product_id || !buy_quantity || !get_product_id || !get_quantity) {
        return res.status(400).json({ message: 'Buy/get product and quantities are required for BXGY offers.' });
      }
    }

    const id = 'off_' + Math.random().toString(36).substring(2, 7);

    await pool.query(
      `INSERT INTO offers 
        (id, title, subtitle, color, code, offer_type,
         discount_type, discount_value,
         buy_product_id, buy_quantity, get_product_id, get_quantity,
         allow_stacking, max_free_qty_per_order, max_usage_per_user, max_usage_total, priority)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, title, subtitle || null, color || '#FF4500', code.toUpperCase(), offer_type,
        discount_type || 'percent', discount_value || 0,
        buy_product_id || null, buy_quantity || 1, get_product_id || null, get_quantity || 1,
        allow_stacking !== false, max_free_qty_per_order || null,
        max_usage_per_user || null, max_usage_total || null, priority || 0,
      ]
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

// ─── PUT /api/offers/:id — Update offer ──────────────────────────────────────
router.put('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      title, subtitle, color, code, is_active,
      offer_type,
      discount_type, discount_value,
      buy_product_id, buy_quantity, get_product_id, get_quantity,
      allow_stacking, max_free_qty_per_order, max_usage_per_user, max_usage_total, priority,
    } = req.body;

    await pool.query(
      `UPDATE offers SET
        title = ?, subtitle = ?, color = ?, code = ?, is_active = ?, offer_type = ?,
        discount_type = ?, discount_value = ?,
        buy_product_id = ?, buy_quantity = ?, get_product_id = ?, get_quantity = ?,
        allow_stacking = ?, max_free_qty_per_order = ?, max_usage_per_user = ?,
        max_usage_total = ?, priority = ?
       WHERE id = ?`,
      [
        title, subtitle || null, color, code.toUpperCase(),
        is_active !== undefined ? is_active : true,
        offer_type || 'coupon',
        discount_type || 'percent', discount_value || 0,
        buy_product_id || null, buy_quantity || 1, get_product_id || null, get_quantity || 1,
        allow_stacking !== false, max_free_qty_per_order || null,
        max_usage_per_user || null, max_usage_total || null, priority || 0,
        id,
      ]
    );

    res.json({ message: 'Offer updated successfully!' });
  } catch (error) {
    console.error('Update offer error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
});

// ─── DELETE /api/offers/:id — Soft delete ────────────────────────────────────
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

// ─── POST /api/offers/validate — Validate coupon code (existing, untouched) ──
router.post('/validate', async (req, res) => {
  try {
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({ message: 'Coupon code is required.' });
    }

    const [offers] = await pool.query(
      "SELECT * FROM offers WHERE code = ? AND is_active = TRUE AND is_deleted = FALSE AND offer_type = 'coupon'",
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

// ─── POST /api/offers/evaluate-bxgy — Evaluate cart for free items ───────────
router.post('/evaluate-bxgy', async (req, res) => {
  try {
    const { cartItems } = req.body; // [{ id, quantity }]

    if (!cartItems || cartItems.length === 0) {
      return res.json({ freeItems: [] });
    }

    // Fetch all active BXGY offers sorted by priority
    const [bxgyOffers] = await pool.query(
      `${BXGY_OFFER_JOIN}
       WHERE o.offer_type = 'buy_x_get_y' AND o.is_active = TRUE AND o.is_deleted = FALSE
       ORDER BY o.priority DESC`
    );

    if (bxgyOffers.length === 0) {
      return res.json({ freeItems: [] });
    }

    const freeItems = [];
    const usedProductIds = new Set(); // for stacking protection

    for (const offer of bxgyOffers) {
      // Check stacking: if allow_stacking=false and a free item for this buy_product already added, skip
      if (!offer.allow_stacking && usedProductIds.has(offer.buy_product_id)) {
        continue;
      }

      // Find the buy product in the cart
      const cartBuyItem = cartItems.find(ci => ci.id === offer.buy_product_id);
      if (!cartBuyItem) continue;

      // Check if meets threshold
      const sets = Math.floor(cartBuyItem.quantity / offer.buy_quantity);
      if (sets <= 0) continue;

      // Calculate free quantity
      let freeQty = sets * offer.get_quantity;

      // Apply max_free_qty_per_order cap
      if (offer.max_free_qty_per_order && freeQty > offer.max_free_qty_per_order) {
        freeQty = offer.max_free_qty_per_order;
      }

      // Apply max_usage_total cap
      if (offer.max_usage_total && offer.usage_count >= offer.max_usage_total) {
        continue;
      }

      freeItems.push({
        offerId: offer.id,
        offerTitle: offer.title,
        priority: offer.priority,
        linkedBuyProductId: offer.buy_product_id,
        linkedBuyQuantity: offer.buy_quantity,
        productId: offer.get_product_id,
        productName: offer.get_product_name,
        productBrand: offer.get_product_brand,
        productImage: offer.get_product_image,
        productPrice: parseFloat(offer.get_product_price) || 0,
        freeQuantity: freeQty,
      });

      usedProductIds.add(offer.buy_product_id);
    }

    res.json({ freeItems });
  } catch (error) {
    console.error('Evaluate BXGY error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
});

// ─── POST /api/offers/record-usage/:id — Increment usage count ───────────────
router.post('/record-usage/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('UPDATE offers SET usage_count = usage_count + 1 WHERE id = ?', [id]);
    res.json({ message: 'Usage recorded.' });
  } catch (error) {
    console.error('Record usage error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
});

module.exports = router;
