const express = require('express');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const auth = require('../middleware/auth');
const router = express.Router();

// Initialize Razorpay
// For testing, users usually use test keys
// If process.env.RAZORPAY_KEY_ID is missing, use a fallback test key or handle error
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || 'rzp_test_dummy_key',
  key_secret: process.env.RAZORPAY_KEY_SECRET || 'dummy_secret',
});

// POST /api/payment/create-order
router.post('/create-order', auth, async (req, res) => {
  try {
    const { amount, currency = 'INR', receipt } = req.body;

    const options = {
      amount: Math.round(amount * 100), // Razorpay expects amount in paise
      currency,
      receipt: receipt || 'receipt_' + Date.now(),
      payment_capture: 1, // Auto capture
    };

    const order = await razorpay.orders.create(options);

    res.json({
      success: true,
      order,
      key: razorpay.key_id, // Send key ID so frontend can use it
    });
  } catch (error) {
    console.error('Razorpay create order error:', error);
    res.status(500).json({ success: false, message: 'Failed to create payment order' });
  }
});

// POST /api/payment/verify
router.post('/verify', auth, (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    const sign = razorpay_order_id + '|' + razorpay_payment_id;
    const expectedSign = crypto
      .createHmac('sha256', razorpay.key_secret)
      .update(sign.toString())
      .digest('hex');

    if (razorpay_signature === expectedSign) {
      return res.json({ success: true, message: 'Payment verified successfully' });
    } else {
      return res.status(400).json({ success: false, message: 'Invalid signature sent' });
    }
  } catch (error) {
    console.error('Razorpay verification error:', error);
    res.status(500).json({ success: false, message: 'Payment verification failed' });
  }
});

module.exports = router;
