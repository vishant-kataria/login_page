const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const path = require('path');
const sgMail = require('@sendgrid/mail');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = require('./db');

const app = express();
app.use(cors());
app.use(express.json());

// Serve static files (HTML, CSS, JS) from the project root
app.use(express.static(require('path').join(__dirname, '..')));

// Initialize SendGrid
console.log('SendGrid API Key loaded:', process.env.SENDGRID_API_KEY ? 'YES' : 'NO');
console.log('Database URL loaded:', process.env.DATABASE_URL ? 'YES' : 'NO');
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// ============================================
// Endpoint 1: POST /api/signup
// Receives user details, generates OTP, emails it
// ============================================
app.post('/api/signup', async (req, res) => {
  const { username, email, password } = req.body;

  // Basic input validation
  if (!username || !email || !password) {
    return res.status(400).json({ message: 'All fields are required.' });
  }

  try {
    // 1. Check if user already exists and is verified
    const existingUser = await pool.query('SELECT id, is_verified FROM users WHERE email = $1', [email]);

    if (existingUser.rows.length > 0 && existingUser.rows[0].is_verified === true) {
      return res.status(400).json({ message: 'An account with this email already exists.' });
    }

    // 2. Hash the password
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // 3. Generate a cryptographically secure 6-digit OTP
    const otp = crypto.randomInt(100000, 999999).toString();

    // 4. Calculate expiration (10 minutes from now)
    const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);

    // 5. Insert or update (upsert) the user in the database
    await pool.query(
      `INSERT INTO users (username, email, password_hash, otp, otp_expires_at, is_verified)
       VALUES ($1, $2, $3, $4, $5, FALSE)
       ON CONFLICT (email)
       DO UPDATE SET username = $1, password_hash = $3, otp = $4, otp_expires_at = $5, is_verified = FALSE`,
      [username, email, passwordHash, otp, otpExpiresAt]
    );

    // 6. Send OTP email via SendGrid
    const msg = {
      to: email,
      from: 'vishantkataria2000@gmail.com',
      subject: 'Your Sign Up Verification Code',
      text: `Your verification code is: ${otp}\n\nThis code will expire in 10 minutes.`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 400px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #333;">Verify Your Email</h2>
          <p>Your verification code is:</p>
          <div style="background: #f5f5f5; padding: 15px; border-radius: 8px; text-align: center; margin: 20px 0;">
            <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #333;">${otp}</span>
          </div>
          <p style="color: #666; font-size: 14px;">This code will expire in 10 minutes.</p>
        </div>
      `,
    };

    await sgMail.send(msg);
    console.log('OTP email sent successfully to:', email);

    res.status(200).json({ message: 'OTP sent successfully.' });
  } catch (error) {
    console.error('Signup Error:', error.message);
    if (error.response) {
      console.error('SendGrid Error Body:', JSON.stringify(error.response.body));
    }
    res.status(500).json({ message: 'Server error. Please try again later.' });
  }
});

// ============================================
// Endpoint 2: POST /api/verify
// Verifies OTP and activates the user account
// ============================================
app.post('/api/verify', async (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    return res.status(400).json({ message: 'Email and OTP are required.' });
  }

  try {
    // 1. Find the user
    const result = await pool.query(
      'SELECT id, otp, otp_expires_at, is_verified FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ message: 'Session expired. Please try signing up again.' });
    }

    const user = result.rows[0];

    // 2. Check if already verified
    if (user.is_verified === true) {
      return res.status(400).json({ message: 'This account is already verified.' });
    }

    // 3. Check if OTP has expired
    if (new Date() > new Date(user.otp_expires_at)) {
      return res.status(400).json({ message: 'OTP has expired. Please try signing up again.' });
    }

    // 4. Check if OTP matches
    if (user.otp !== otp) {
      return res.status(400).json({ message: 'Invalid OTP. Please try again.' });
    }

    // 5. Mark user as verified and clear OTP fields
    await pool.query(
      'UPDATE users SET is_verified = TRUE, otp = NULL, otp_expires_at = NULL WHERE email = $1',
      [email]
    );

    res.status(200).json({ message: 'Account created successfully!' });
  } catch (error) {
    console.error('Verification Error:', error.message);
    res.status(500).json({ message: 'Server error during verification.' });
  }
});

// CRITICAL FOR VERCEL: Export the app instead of using app.listen()
module.exports = app;
