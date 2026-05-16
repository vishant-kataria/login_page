const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const path = require('path');
const sgMail = require('@sendgrid/mail');
const { OAuth2Client } = require('google-auth-library');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = require('./db');
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..')));

// Initialize SendGrid
console.log('SendGrid API Key loaded:', process.env.SENDGRID_API_KEY ? 'YES' : 'NO');
console.log('Database URL loaded:', process.env.DATABASE_URL ? 'YES' : 'NO');
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// ============================================
// POST /api/signup
// ============================================
app.post('/api/signup', async (req, res) => {
  const { username, fullName, email, password } = req.body;

  if (!username || !fullName || !email || !password) {
    return res.status(400).json({ message: 'All fields are required.' });
  }

  try {
    // Check if email already verified
    const existingEmail = await pool.query('SELECT id, is_verified FROM users WHERE email = $1', [email]);
    if (existingEmail.rows.length > 0 && existingEmail.rows[0].is_verified === true) {
      return res.status(400).json({ message: 'An account with this email already exists.' });
    }

    // Check if username is taken by a verified user
    const existingUsername = await pool.query('SELECT id, is_verified FROM users WHERE username = $1', [username]);
    if (existingUsername.rows.length > 0 && existingUsername.rows[0].is_verified === true) {
      return res.status(400).json({ message: 'This username is already taken.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const otp = crypto.randomInt(100000, 999999).toString();
    const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await pool.query(
      `INSERT INTO users (username, full_name, email, password_hash, otp, otp_expires_at, is_verified)
       VALUES ($1, $2, $3, $4, $5, $6, FALSE)
       ON CONFLICT (email)
       DO UPDATE SET username = $1, full_name = $2, password_hash = $4, otp = $5, otp_expires_at = $6, is_verified = FALSE`,
      [username, fullName, email, passwordHash, otp, otpExpiresAt]
    );

    await sgMail.send({
      to: email,
      from: 'vishantkataria2000@gmail.com',
      subject: 'Your Sign Up Verification Code',
      text: `Your verification code is: ${otp}\nThis code will expire in 10 minutes.`,
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
    });
    console.log('OTP sent to:', email);

    res.status(200).json({ message: 'OTP sent successfully.' });
  } catch (error) {
    console.error('Signup Error:', error);
    if (error.response) console.error('SendGrid:', JSON.stringify(error.response.body));
    res.status(500).json({ message: 'Server error. Please try again later.' });
  }
});

// ============================================
// POST /api/verify
// ============================================
app.post('/api/verify', async (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    return res.status(400).json({ message: 'Email and OTP are required.' });
  }

  try {
    const result = await pool.query(
      'SELECT id, otp, otp_expires_at, is_verified FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ message: 'Session expired. Please sign up again.' });
    }

    const user = result.rows[0];

    if (user.is_verified) {
      return res.status(400).json({ message: 'Account already verified.' });
    }
    if (new Date() > new Date(user.otp_expires_at)) {
      return res.status(400).json({ message: 'OTP expired. Please sign up again.' });
    }
    if (user.otp !== otp) {
      return res.status(400).json({ message: 'Invalid OTP.' });
    }

    await pool.query(
      'UPDATE users SET is_verified = TRUE, otp = NULL, otp_expires_at = NULL WHERE email = $1',
      [email]
    );

    res.status(200).json({ message: 'Account created successfully!' });
  } catch (error) {
    console.error('Verify Error:', error);
    res.status(500).json({ message: 'Server error during verification.' });
  }
});

// ============================================
// Endpoint 3: POST /api/signin
// Verifies email/username + password credentials
// ============================================
app.post('/api/signin', async (req, res) => {
  const { identifier, password } = req.body;

  if (!identifier || !password) {
    return res.status(400).json({ message: 'Email/username and password are required.' });
  }

  try {
    // Check if identifier is an email or username
    const isEmail = identifier.includes('@');
    const result = await pool.query(
      isEmail
        ? 'SELECT id, email, password_hash, is_verified FROM users WHERE email = $1'
        : 'SELECT id, email, password_hash, is_verified FROM users WHERE username = $1',
      [identifier]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ message: 'No account found.' });
    }

    const user = result.rows[0];

    if (!user.is_verified) {
      return res.status(400).json({ message: 'Account not verified. Please sign up again.' });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(400).json({ message: 'Incorrect password.' });
    }

    res.status(200).json({
      message: 'Credentials verified.',
      email: user.email,
    });
  } catch (error) {
    console.error('Signin Error:', error.message);
    res.status(500).json({ message: 'Server error. Please try again later.' });
  }
});

// ============================================
// Endpoint 4: POST /api/signin/send-otp
// Sends sign-in OTP via Email (SendGrid)
// ============================================
app.post('/api/signin/send-otp', async (req, res) => {
  const { email, method } = req.body;

  if (!email || !method) {
    return res.status(400).json({ message: 'Email and method are required.' });
  }

  try {
    const result = await pool.query(
      'SELECT id, email FROM users WHERE email = $1 AND is_verified = TRUE',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ message: 'User not found.' });
    }

    const user = result.rows[0];

    // Generate 6-digit OTP
    const otp = crypto.randomInt(100000, 999999).toString();
    const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);

    // Save OTP to database
    await pool.query(
      'UPDATE users SET signin_otp = $1, signin_otp_expires_at = $2 WHERE email = $3',
      [otp, otpExpiresAt, email]
    );

    if (method === 'email') {
      const msg = {
        to: email,
        from: 'vishantkataria2000@gmail.com',
        subject: 'Your Sign In Verification Code',
        text: `Your sign-in verification code is: ${otp}\n\nThis code will expire in 10 minutes.`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 400px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #333;">Sign In Verification</h2>
            <p>Your verification code is:</p>
            <div style="background: #f5f5f5; padding: 15px; border-radius: 8px; text-align: center; margin: 20px 0;">
              <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #333;">${otp}</span>
            </div>
            <p style="color: #666; font-size: 14px;">This code will expire in 10 minutes.</p>
            <p style="color: #999; font-size: 12px;">If you didn't request this, please ignore this email.</p>
          </div>
        `,
      };
      await sgMail.send(msg);
      console.log('Sign-in OTP email sent to:', email);
    } else {
      return res.status(400).json({ message: 'Invalid OTP method. Use "email".' });
    }

    res.status(200).json({ message: 'OTP sent successfully.' });
  } catch (error) {
    console.error('Send OTP Error:', error.message);
    res.status(500).json({ message: 'Server error. Please try again later.' });
  }
});

// ============================================
// Endpoint 5: POST /api/signin/verify-otp
// Verifies sign-in OTP and completes login
// ============================================
app.post('/api/signin/verify-otp', async (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    return res.status(400).json({ message: 'Email and OTP are required.' });
  }

  try {
    const result = await pool.query(
      'SELECT id, username, signin_otp, signin_otp_expires_at FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ message: 'User not found.' });
    }

    const user = result.rows[0];

    if (new Date() > new Date(user.signin_otp_expires_at)) {
      return res.status(400).json({ message: 'OTP has expired. Please request a new one.' });
    }

    if (user.signin_otp !== otp) {
      return res.status(400).json({ message: 'Invalid OTP. Please try again.' });
    }

    await pool.query(
      'UPDATE users SET signin_otp = NULL, signin_otp_expires_at = NULL WHERE email = $1',
      [email]
    );

    res.status(200).json({
      message: 'Sign-in successful!',
      user: { id: user.id, username: user.username, email },
    });
  } catch (error) {
    console.error('Verify OTP Error:', error.message);
    res.status(500).json({ message: 'Server error during verification.' });
  }
});

// ============================================
// Endpoint 7: POST /api/signin/forgot-password
// Sends a password reset OTP to user's email
// ============================================
app.post('/api/signin/forgot-password', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ message: 'Email is required.' });
  }

  try {
    const result = await pool.query(
      'SELECT id FROM users WHERE email = $1 AND is_verified = TRUE',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ message: 'No verified account found with this email.' });
    }

    const otp = crypto.randomInt(100000, 999999).toString();
    const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await pool.query(
      'UPDATE users SET reset_otp = $1, reset_otp_expires_at = $2 WHERE email = $3',
      [otp, otpExpiresAt, email]
    );

    const msg = {
      to: email,
      from: 'vishantkataria2000@gmail.com',
      subject: 'Password Reset Code',
      text: `Your password reset code is: ${otp}\n\nThis code will expire in 10 minutes.`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 400px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #333;">Password Reset</h2>
          <p>Your reset code is:</p>
          <div style="background: #f5f5f5; padding: 15px; border-radius: 8px; text-align: center; margin: 20px 0;">
            <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #333;">${otp}</span>
          </div>
          <p style="color: #666; font-size: 14px;">This code will expire in 10 minutes.</p>
          <p style="color: #999; font-size: 12px;">If you didn't request this, please ignore this email.</p>
        </div>
      `,
    };
    await sgMail.send(msg);
    console.log('Password reset OTP sent to:', email);

    res.status(200).json({ message: 'Reset code sent to your email.' });
  } catch (error) {
    console.error('Forgot Password Error:', error.message);
    res.status(500).json({ message: 'Server error. Please try again later.' });
  }
});

// ============================================
// Endpoint 8: POST /api/signin/reset-password
// Verifies reset OTP and updates password
// ============================================
app.post('/api/signin/reset-password', async (req, res) => {
  const { email, otp, newPassword } = req.body;

  if (!email || !otp || !newPassword) {
    return res.status(400).json({ message: 'All fields are required.' });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ message: 'Password must be at least 6 characters.' });
  }

  try {
    const result = await pool.query(
      'SELECT id, reset_otp, reset_otp_expires_at FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ message: 'User not found.' });
    }

    const user = result.rows[0];

    if (new Date() > new Date(user.reset_otp_expires_at)) {
      return res.status(400).json({ message: 'Reset code has expired. Please request a new one.' });
    }

    if (user.reset_otp !== otp) {
      return res.status(400).json({ message: 'Invalid reset code.' });
    }

    const newHash = await bcrypt.hash(newPassword, 10);

    await pool.query(
      'UPDATE users SET password_hash = $1, reset_otp = NULL, reset_otp_expires_at = NULL WHERE email = $2',
      [newHash, email]
    );

    res.status(200).json({ message: 'Password reset successfully!' });
  } catch (error) {
    console.error('Reset Password Error:', error.message);
    res.status(500).json({ message: 'Server error during password reset.' });
  }
});

// ============================================
// POST /api/auth/google
// Google OAuth: Verify token and sign in/up
// ============================================
app.post('/api/auth/google', async (req, res) => {
  const { credential } = req.body;

  if (!credential) {
    return res.status(400).json({ message: 'Google credential is required.' });
  }

  try {
    // Verify the Google ID token
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const { sub: googleId, email, name, picture } = payload;

    if (!email) {
      return res.status(400).json({ message: 'Could not retrieve email from Google.' });
    }

    // Check if user already exists by email
    const existingUser = await pool.query(
      'SELECT id, username, email, google_id, is_verified FROM users WHERE email = $1',
      [email]
    );

    let user;

    if (existingUser.rows.length > 0) {
      // User exists — link Google ID if not already linked, and ensure verified
      user = existingUser.rows[0];
      if (!user.google_id) {
        await pool.query(
          'UPDATE users SET google_id = $1, is_verified = TRUE WHERE email = $2',
          [googleId, email]
        );
      } else if (!user.is_verified) {
        await pool.query(
          'UPDATE users SET is_verified = TRUE WHERE email = $1',
          [email]
        );
      }
    } else {
      // New user — create account automatically (no password, no OTP needed)
      const username = email.split('@')[0] + '_' + Math.floor(Math.random() * 1000);
      const fullName = name || email.split('@')[0];

      const insertResult = await pool.query(
        `INSERT INTO users (username, full_name, email, google_id, is_verified)
         VALUES ($1, $2, $3, $4, TRUE)
         RETURNING id, username, email`,
        [username, fullName, email, googleId]
      );
      user = insertResult.rows[0];
    }

    // Fetch the final user data
    const finalUser = await pool.query(
      'SELECT id, username, email FROM users WHERE email = $1',
      [email]
    );

    res.status(200).json({
      message: 'Google sign-in successful!',
      user: finalUser.rows[0],
    });
  } catch (error) {
    console.error('Google Auth Error:', error.message);
    res.status(500).json({ message: 'Google authentication failed. Please try again.' });
  }
});

// CRITICAL FOR VERCEL: Export the app instead of using app.listen()
module.exports = app;
