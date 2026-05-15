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

// ============================================
// Endpoint 3: POST /api/signin
// Verifies email + password credentials
// ============================================
app.post('/api/signin', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required.' });
  }

  try {
    const result = await pool.query(
      'SELECT id, email, password_hash, phone, is_verified FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ message: 'No account found with this email.' });
    }

    const user = result.rows[0];

    if (!user.is_verified) {
      return res.status(400).json({ message: 'Account not verified. Please sign up again.' });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(400).json({ message: 'Incorrect password.' });
    }

    // Mask the phone number for the frontend (e.g., ******7890)
    let maskedPhone = null;
    if (user.phone) {
      maskedPhone = '******' + user.phone.slice(-4);
    }

    res.status(200).json({
      message: 'Credentials verified.',
      maskedPhone,
    });
  } catch (error) {
    console.error('Signin Error:', error.message);
    res.status(500).json({ message: 'Server error. Please try again later.' });
  }
});

// ============================================
// Endpoint 4: POST /api/signin/send-otp
// Sends sign-in OTP via Email (SendGrid) or SMS (Fast2SMS)
// ============================================
app.post('/api/signin/send-otp', async (req, res) => {
  const { email, method } = req.body; // method: 'email' or 'sms'

  if (!email || !method) {
    return res.status(400).json({ message: 'Email and method are required.' });
  }

  try {
    const result = await pool.query(
      'SELECT id, email, phone FROM users WHERE email = $1 AND is_verified = TRUE',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ message: 'User not found.' });
    }

    const user = result.rows[0];

    // Generate 6-digit OTP
    const otp = crypto.randomInt(100000, 999999).toString();
    const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Save OTP to database
    await pool.query(
      'UPDATE users SET signin_otp = $1, signin_otp_expires_at = $2 WHERE email = $3',
      [otp, otpExpiresAt, email]
    );

    if (method === 'email') {
      // Send via SendGrid
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

    } else if (method === 'sms') {
      // Send via Fast2SMS
      if (!user.phone) {
        return res.status(400).json({ message: 'No phone number linked to this account.' });
      }

      const fast2smsResponse = await fetch('https://www.fast2sms.com/dev/bulkV2', {
        method: 'POST',
        headers: {
          'authorization': process.env.FAST2SMS_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          route: 'otp',
          variables_values: otp,
          numbers: user.phone,
        }),
      });

      const smsData = await fast2smsResponse.json();
      if (!smsData.return) {
        console.error('Fast2SMS Error:', smsData);
        return res.status(500).json({ message: 'Failed to send SMS. Please try email instead.' });
      }
      console.log('Sign-in OTP SMS sent to:', user.phone);
    } else {
      return res.status(400).json({ message: 'Invalid OTP method. Use "email" or "sms".' });
    }

    let maskedPhone = null;
    if (user.phone) {
      maskedPhone = '******' + user.phone.slice(-4);
    }

    res.status(200).json({ message: 'OTP sent successfully.', maskedPhone });
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

    // Check if OTP has expired
    if (new Date() > new Date(user.signin_otp_expires_at)) {
      return res.status(400).json({ message: 'OTP has expired. Please request a new one.' });
    }

    // Check if OTP matches
    if (user.signin_otp !== otp) {
      return res.status(400).json({ message: 'Invalid OTP. Please try again.' });
    }

    // Clear the OTP fields after successful verification
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
// Endpoint 6: POST /api/signin/recover-email
// Finds a user's masked email by their username
// ============================================
app.post('/api/signin/recover-email', async (req, res) => {
  const { username } = req.body;

  if (!username) {
    return res.status(400).json({ message: 'Username is required.' });
  }

  try {
    const result = await pool.query(
      'SELECT email FROM users WHERE username = $1 AND is_verified = TRUE',
      [username]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ message: 'No verified account found with this username.' });
    }

    const email = result.rows[0].email;
    // Mask the email: v***t@gmail.com
    const [local, domain] = email.split('@');
    let maskedEmail;
    if (local.length <= 2) {
      maskedEmail = local[0] + '***@' + domain;
    } else {
      maskedEmail = local[0] + '***' + local[local.length - 1] + '@' + domain;
    }

    res.status(200).json({ maskedEmail });
  } catch (error) {
    console.error('Recover Email Error:', error.message);
    res.status(500).json({ message: 'Server error. Please try again later.' });
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

    // Generate reset OTP
    const otp = crypto.randomInt(100000, 999999).toString();
    const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await pool.query(
      'UPDATE users SET reset_otp = $1, reset_otp_expires_at = $2 WHERE email = $3',
      [otp, otpExpiresAt, email]
    );

    // Send reset code via SendGrid
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

    // Check expiry
    if (new Date() > new Date(user.reset_otp_expires_at)) {
      return res.status(400).json({ message: 'Reset code has expired. Please request a new one.' });
    }

    // Check OTP match
    if (user.reset_otp !== otp) {
      return res.status(400).json({ message: 'Invalid reset code.' });
    }

    // Hash new password and update
    const saltRounds = 10;
    const newHash = await bcrypt.hash(newPassword, saltRounds);

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

// CRITICAL FOR VERCEL: Export the app instead of using app.listen()
module.exports = app;
