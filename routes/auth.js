const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/db');
const auth = require('../middleware/auth');

const router = express.Router();

// Helper: generate JWT
const generateToken = (user) => {
  return jwt.sign(
    { id: user.id, phone: user.phone, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
};

// Helper: generate 4-digit OTP
const generateOTP = () => {
  return Math.floor(1000 + Math.random() * 9000).toString();
};

// ─── PHONE OTP FLOW ───

// POST /api/auth/send-otp
router.post('/send-otp', async (req, res) => {
  try {
    const { phone } = req.body;

    if (!phone || phone.length < 10) {
      return res.status(400).json({ message: 'Valid phone number is required.' });
    }

    // Generate OTP
    const otpCode = generateOTP();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    // Invalidate any previous OTPs for this phone
    await pool.query(
      'UPDATE otps SET is_used = TRUE WHERE phone = ? AND is_used = FALSE',
      [phone]
    );

    // Store new OTP
    await pool.query(
      'INSERT INTO otps (phone, otp_code, expires_at) VALUES (?, ?, ?)',
      [phone, otpCode, expiresAt]
    );

    // In production, send OTP via SMS (Twilio, etc.)
    // For development, we return the OTP in the response
    console.log(`OTP for ${phone}: ${otpCode}`);

    res.json({
      message: 'OTP sent successfully!',
      // Remove this in production - only for testing
      otp: otpCode,
      expiresIn: 300, // seconds
    });
  } catch (error) {
    console.error('Send OTP error:', error);
    res.status(500).json({ message: 'Failed to send OTP. Please try again.' });
  }
});

// POST /api/auth/verify-otp
router.post('/verify-otp', async (req, res) => {
  try {
    const { phone, otp } = req.body;

    if (!phone || !otp) {
      return res.status(400).json({ message: 'Phone and OTP are required.' });
    }

    // Find valid OTP
    const [otps] = await pool.query(
      `SELECT * FROM otps 
       WHERE phone = ? AND otp_code = ? AND is_used = FALSE AND expires_at > NOW()
       ORDER BY created_at DESC LIMIT 1`,
      [phone, otp]
    );

    if (otps.length === 0) {
      return res.status(401).json({ message: 'Invalid or expired OTP.' });
    }

    // Mark OTP as used
    await pool.query('UPDATE otps SET is_used = TRUE WHERE id = ?', [otps[0].id]);

    // Check if user exists
    const [users] = await pool.query('SELECT * FROM users WHERE phone = ?', [phone]);

    let user;
    let isNewUser = false;

    if (users.length > 0) {
      user = users[0];
    } else {
      // Create new user with just phone number
      const [result] = await pool.query(
        'INSERT INTO users (phone, is_profile_complete) VALUES (?, FALSE)',
        [phone]
      );
      user = { id: result.insertId, phone, is_profile_complete: false };
      isNewUser = true;
    }

    const token = generateToken(user);

    res.json({
      message: isNewUser ? 'Welcome! Please complete your profile.' : 'Login successful!',
      token,
      user: {
        id: user.id,
        name: user.name || null,
        email: user.email || null,
        phone: user.phone,
        address: user.address || null,
        role: user.role || 'user',
        isProfileComplete: !!user.is_profile_complete,
      },
      isNewUser,
    });
  } catch (error) {
    console.error('Verify OTP error:', error);
    res.status(500).json({ message: 'Verification failed. Please try again.' });
  }
});

// POST /api/auth/complete-profile
router.post('/complete-profile', auth, async (req, res) => {
  try {
    const { name, email, address } = req.body;

    if (!name) {
      return res.status(400).json({ message: 'Name is required.' });
    }

    // Check email uniqueness if provided
    if (email) {
      const [existing] = await pool.query(
        'SELECT id FROM users WHERE email = ? AND id != ?',
        [email, req.user.id]
      );
      if (existing.length > 0) {
        return res.status(409).json({ message: 'This email is already registered.' });
      }
    }

    await pool.query(
      'UPDATE users SET name = ?, email = ?, address = ?, is_profile_complete = TRUE WHERE id = ?',
      [name, email || null, address || null, req.user.id]
    );

    const [users] = await pool.query('SELECT * FROM users WHERE id = ?', [req.user.id]);
    const user = users[0];

    res.json({
      message: 'Profile completed successfully!',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        address: user.address,
        role: user.role || 'user',
        isProfileComplete: true,
      },
    });
  } catch (error) {
    console.error('Complete profile error:', error);
    res.status(500).json({ message: 'Failed to update profile.' });
  }
});

// ─── EMAIL + PASSWORD FLOW ───

// POST /api/auth/signup
router.post('/signup', async (req, res) => {
  try {
    const { name, email, phone, password, address } = req.body;

    if (!name || !email || !password || !phone) {
      return res.status(400).json({ message: 'Name, email, phone, and password are required.' });
    }

    // Check if email or phone already exists
    const [existingEmail] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existingEmail.length > 0) {
      return res.status(409).json({ message: 'An account with this email already exists.' });
    }

    const [existingPhone] = await pool.query('SELECT id FROM users WHERE phone = ?', [phone]);
    if (existingPhone.length > 0) {
      return res.status(409).json({ message: 'An account with this phone number already exists.' });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const [result] = await pool.query(
      'INSERT INTO users (name, email, phone, password_hash, address, is_profile_complete) VALUES (?, ?, ?, ?, ?, TRUE)',
      [name, email, phone, passwordHash, address || null]
    );

    const token = generateToken({ id: result.insertId, phone, email });

    res.status(201).json({
      message: 'Account created successfully!',
      token,
      user: {
        id: result.insertId,
        name,
        email,
        phone,
        address: address || null,
        role: 'user',
        isProfileComplete: true,
      },
    });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ message: 'Server error. Please try again.' });
  }
});

// POST /api/auth/login (email + password)
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required.' });
    }

    const [users] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
    if (users.length === 0) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    const user = users[0];

    if (!user.password_hash) {
      return res.status(401).json({ message: 'This account uses phone login. Please use OTP.' });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    const token = generateToken(user);

    res.json({
      message: 'Login successful!',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        address: user.address,
        role: user.role || 'user',
        isProfileComplete: !!user.is_profile_complete,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error. Please try again.' });
  }
});

// GET /api/auth/phone/:phone
router.get('/phone/:phone', auth, async (req, res) => {
  try {
    const { phone } = req.params;
    const [users] = await pool.query('SELECT id, name, phone, email, address FROM users WHERE phone = ?', [phone]);
    if (users.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json({ user: users[0] });
  } catch (error) {
    console.error('Get user by phone error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/auth/me
router.get('/me', auth, async (req, res) => {
  try {
    const [users] = await pool.query(
      'SELECT id, name, email, phone, address, role, is_profile_complete, created_at FROM users WHERE id = ?',
      [req.user.id]
    );

    if (users.length === 0) {
      return res.status(404).json({ message: 'User not found.' });
    }

    const user = users[0];
    res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        address: user.address,
        role: user.role || 'user',
        isProfileComplete: !!user.is_profile_complete,
      },
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
});

// POST /api/auth/admin/users
router.post('/admin/users', auth, async (req, res) => {
  try {
    // Verify admin
    const [adminCheck] = await pool.query('SELECT role FROM users WHERE id = ?', [req.user.id]);
    if (adminCheck.length === 0 || adminCheck[0].role !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Admin only.' });
    }

    const { name, email, phone, password, role } = req.body;

    if (!name || !email || !password || !phone || !role) {
      return res.status(400).json({ message: 'Name, email, phone, password, and role are required.' });
    }

    // Check existing
    const [existingEmail] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existingEmail.length > 0) {
      return res.status(409).json({ message: 'An account with this email already exists.' });
    }
    const [existingPhone] = await pool.query('SELECT id FROM users WHERE phone = ?', [phone]);
    if (existingPhone.length > 0) {
      return res.status(409).json({ message: 'An account with this phone number already exists.' });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    await pool.query(
      'INSERT INTO users (name, email, phone, password_hash, role, is_profile_complete) VALUES (?, ?, ?, ?, ?, TRUE)',
      [name, email, phone, passwordHash, role]
    );

    res.status(201).json({ message: 'User created successfully!' });
  } catch (error) {
    console.error('Admin create user error:', error);
    res.status(500).json({ message: 'Server error. Please try again.' });
  }
});

// GET /api/auth/admin/users
router.get('/admin/users', auth, async (req, res) => {
  try {
    const [users] = await pool.query('SELECT id, name, email, phone, role, is_profile_complete, created_at FROM users WHERE is_deleted = FALSE ORDER BY created_at DESC');
    res.json(users);
  } catch (error) {
    console.error('Admin get users error:', error);
    res.status(500).json({ message: 'Server error. Please try again.' });
  }
});

// PUT /api/auth/admin/users/:id - Update user details
router.put('/admin/users/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, phone, role } = req.body;

    await pool.query(
      'UPDATE users SET name = ?, email = ?, phone = ?, role = ? WHERE id = ?',
      [name, email, phone, role, id]
    );

    res.json({ message: 'User updated successfully!' });
  } catch (error) {
    console.error('Admin update user error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
});

// DELETE /api/auth/admin/users/:id - Soft delete user
router.delete('/admin/users/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('UPDATE users SET is_deleted = TRUE WHERE id = ?', [id]);
    res.json({ message: 'User deleted successfully!' });
  } catch (error) {
    console.error('Admin delete user error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
});

module.exports = router;
