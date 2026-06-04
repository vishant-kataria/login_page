const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const path = require('path');
const sgMail = require('@sendgrid/mail');
const { OAuth2Client } = require('google-auth-library');
// ===== PHONE VERIFICATION DISABLED (Twilio is paid) — uncomment when ready =====
// const twilio = require('twilio');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = require('./db');
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
// ===== PHONE VERIFICATION DISABLED (Twilio is paid) — uncomment when ready =====
// const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..')));

// Initialize SendGrid
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

console.log('SendGrid API Key loaded:', process.env.SENDGRID_API_KEY ? 'YES' : 'NO');
console.log('Database URL loaded:', process.env.DATABASE_URL ? 'YES' : 'NO');
// ===== PHONE VERIFICATION DISABLED (Twilio is paid) — uncomment when ready =====
// console.log('Twilio Account SID loaded:', process.env.TWILIO_ACCOUNT_SID ? 'YES' : 'NO');

// ============================================
// HELPERS
// ============================================

function generateOtp() {
  return crypto.randomInt(100000, 999999).toString();
}

function otpExpiry(minutes = 10) {
  return new Date(Date.now() + minutes * 60 * 1000);
}

// ===== PHONE VERIFICATION DISABLED (Twilio is paid) — uncomment when ready =====
// function formatPhoneNumber(phone) {
//   if (!phone) return phone;
//   // Strip all non-numeric characters except +
//   let cleaned = phone.replace(/[^\d+]/g, '');
//   if (cleaned.startsWith('+')) {
//     return cleaned;
//   }
//   // If it's a 10-digit number, prepend +91 (India) as a safe fallback
//   if (cleaned.length === 10) {
//     return '+91' + cleaned;
//   }
//   // If it starts with 91 and has 12 digits, prepend +
//   if (cleaned.length === 12 && cleaned.startsWith('91')) {
//     return '+' + cleaned;
//   }
//   // If it has 11 digits and starts with 0 (e.g. 09350332515), strip 0 and prepend +91
//   if (cleaned.length === 11 && cleaned.startsWith('0')) {
//     return '+91' + cleaned.slice(1);
//   }
//   return '+' + cleaned;
// }

async function sendEmailOtp(toEmail, otp, subject, headingText) {
  await sgMail.send({
    to: toEmail,
    from: 'auth@vishant.xyz',
    subject,
    text: `Your verification code is: ${otp}\nThis code will expire in 10 minutes.`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 400px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #333;">${headingText}</h2>
        <p>Your verification code is:</p>
        <div style="background: #f5f5f5; padding: 15px; border-radius: 8px; text-align: center; margin: 20px 0;">
          <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #333;">${otp}</span>
        </div>
        <p style="color: #666; font-size: 14px;">This code will expire in 10 minutes.</p>
        <p style="color: #999; font-size: 12px;">If you didn't request this, please ignore this message.</p>
      </div>
    `,
  });
}

// ===== PHONE VERIFICATION DISABLED (Twilio is paid) — uncomment when ready =====
// async function sendSmsOtp(toPhone, otp, messageText) {
//   await twilioClient.messages.create({
//     body: `${messageText}: ${otp}\nThis code expires in 10 minutes.`,
//     from: process.env.TWILIO_PHONE_NUMBER,
//     to: toPhone,
//   });
// }

function maskEmail(email) {
  const [local, domain] = email.split('@');
  if (local.length <= 2) return local[0] + '***@' + domain;
  return local[0] + '***' + local[local.length - 1] + '@' + domain;
}

// ===== PHONE VERIFICATION DISABLED (Twilio is paid) — uncomment when ready =====
// function maskPhone(phone) {
//   if (!phone) return null;
//   return phone.slice(0, -4).replace(/\d/g, '*') + phone.slice(-4);
// }

// ============================================
// POST /api/signup
// Creates user, sends email OTP (phone OTP disabled)
// ============================================
app.post('/api/signup', async (req, res) => {
  // ===== PHONE VERIFICATION DISABLED (Twilio is paid) — uncomment when ready =====
  // Original: const { username, fullName, email, password, phoneNumber } = req.body;
  const { username, fullName, email, password } = req.body;

  // ===== PHONE VERIFICATION DISABLED (Twilio is paid) — uncomment when ready =====
  // Original: if (!username || !fullName || !email || !password || !phoneNumber) {
  //   return res.status(400).json({ message: 'All fields including phone number are required.' });
  // }
  if (!username || !fullName || !email || !password) {
    return res.status(400).json({ message: 'All fields are required.' });
  }

  // ===== PHONE VERIFICATION DISABLED (Twilio is paid) — uncomment when ready =====
  // const formattedPhone = formatPhoneNumber(phoneNumber);

  try {
    // Check verified conflicts
    const existingEmail = await pool.query('SELECT id, is_verified FROM users WHERE email = $1', [email]);
    if (existingEmail.rows.length > 0 && existingEmail.rows[0].is_verified === true) {
      return res.status(400).json({ message: 'An account with this email already exists.' });
    }

    const existingUsername = await pool.query('SELECT id, is_verified FROM users WHERE username = $1', [username]);
    if (existingUsername.rows.length > 0 && existingUsername.rows[0].is_verified === true) {
      return res.status(400).json({ message: 'This username is already taken.' });
    }

    // ===== PHONE VERIFICATION DISABLED (Twilio is paid) — uncomment when ready =====
    // const existingPhone = await pool.query('SELECT id, is_verified FROM users WHERE phone_number = $1', [formattedPhone]);
    // if (existingPhone.rows.length > 0 && existingPhone.rows[0].is_verified === true) {
    //   return res.status(400).json({ message: 'An account with this phone number already exists.' });
    // }

    const passwordHash = await bcrypt.hash(password, 10);
    const emailOtp = generateOtp();
    // ===== PHONE VERIFICATION DISABLED (Twilio is paid) — uncomment when ready =====
    // const phoneOtp = generateOtp();
    const otpExpiresAt = otpExpiry(10);

    // Upsert user record (email-only verification)
    // ===== PHONE VERIFICATION DISABLED (Twilio is paid) — original query below =====
    // await pool.query(
    //   `INSERT INTO users (username, full_name, email, phone_number, password_hash, otp, otp_expires_at, phone_otp, phone_otp_expires_at, is_email_verified, is_phone_verified, is_verified)
    //    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, FALSE, FALSE, FALSE)
    //    ON CONFLICT (email)
    //    DO UPDATE SET
    //      username = $1, full_name = $2, phone_number = $4, password_hash = $5,
    //      otp = $6, otp_expires_at = $7,
    //      phone_otp = $8, phone_otp_expires_at = $9,
    //      is_email_verified = FALSE, is_phone_verified = FALSE, is_verified = FALSE`,
    //   [username, fullName, email, formattedPhone, passwordHash, emailOtp, otpExpiresAt, phoneOtp, otpExpiresAt]
    // );
    await pool.query(
      `INSERT INTO users (username, full_name, email, password_hash, otp, otp_expires_at, is_email_verified, is_verified)
       VALUES ($1, $2, $3, $4, $5, $6, FALSE, FALSE)
       ON CONFLICT (email)
       DO UPDATE SET
         username = $1, full_name = $2, password_hash = $4,
         otp = $5, otp_expires_at = $6,
         is_email_verified = FALSE, is_verified = FALSE`,
      [username, fullName, email, passwordHash, emailOtp, otpExpiresAt]
    );

    // Send email OTP
    try {
      await sendEmailOtp(email, emailOtp, 'Your Sign Up Email Verification Code', 'Verify Your Email');
    } catch (emailErr) {
      console.error('Signup Email Error:', emailErr);
      return res.status(500).json({ message: 'Failed to send verification email. Please check your email address.' });
    }

    // ===== PHONE VERIFICATION DISABLED (Twilio is paid) — uncomment when ready =====
    // // Send phone OTP via Twilio
    // try {
    //   await sendSmsOtp(formattedPhone, phoneOtp, 'Your verification code');
    // } catch (smsErr) {
    //   console.error('Signup SMS Error:', smsErr.message);
    //   return res.status(500).json({ message: 'Failed to send SMS. Please verify your phone number (ensure country code is included).' });
    // }

    console.log('Signup OTP sent — Email:', email);
    res.status(200).json({ message: 'OTP sent successfully. Please verify your email.' });
  } catch (error) {
    console.error('Signup Error:', error);
    if (error.response) console.error('SendGrid:', JSON.stringify(error.response.body));
    res.status(500).json({ message: 'Server error. Please try again later.' });
  }
});

// ============================================
// POST /api/signup/verify-email
// Verifies the email OTP and marks is_email_verified
// ============================================
app.post('/api/signup/verify-email', async (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    return res.status(400).json({ message: 'Email and OTP are required.' });
  }

  try {
    const result = await pool.query(
      'SELECT id, otp, otp_expires_at, is_email_verified FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ message: 'Session expired. Please sign up again.' });
    }

    const user = result.rows[0];

    if (user.is_email_verified) {
      return res.status(200).json({ message: 'Email already verified.' });
    }
    if (new Date() > new Date(user.otp_expires_at)) {
      return res.status(400).json({ message: 'Email OTP expired. Please start over.' });
    }
    if (user.otp !== otp) {
      return res.status(400).json({ message: 'Invalid email OTP.' });
    }

    await pool.query(
      'UPDATE users SET is_email_verified = TRUE, otp = NULL, otp_expires_at = NULL WHERE email = $1',
      [email]
    );

    res.status(200).json({ message: 'Email verified successfully.' });
  } catch (error) {
    console.error('Verify Email Error:', error);
    res.status(500).json({ message: 'Server error during email verification.' });
  }
});

// ===== PHONE VERIFICATION DISABLED (Twilio is paid) — uncomment when ready =====
// // ============================================
// // POST /api/signup/verify-phone
// // Verifies the phone OTP and marks is_phone_verified
// // ============================================
// app.post('/api/signup/verify-phone', async (req, res) => {
//   const { email, otp } = req.body;
//
//   if (!email || !otp) {
//     return res.status(400).json({ message: 'Email and OTP are required.' });
//   }
//
//   try {
//     const result = await pool.query(
//       'SELECT id, phone_otp, phone_otp_expires_at, is_phone_verified FROM users WHERE email = $1',
//       [email]
//     );
//
//     if (result.rows.length === 0) {
//       return res.status(400).json({ message: 'Session expired. Please sign up again.' });
//     }
//
//     const user = result.rows[0];
//
//     if (user.is_phone_verified) {
//       return res.status(200).json({ message: 'Phone already verified.' });
//     }
//     if (new Date() > new Date(user.phone_otp_expires_at)) {
//       return res.status(400).json({ message: 'Phone OTP expired. Please start over.' });
//     }
//     if (user.phone_otp !== otp) {
//       return res.status(400).json({ message: 'Invalid phone OTP.' });
//     }
//
//     await pool.query(
//       'UPDATE users SET is_phone_verified = TRUE, phone_otp = NULL, phone_otp_expires_at = NULL WHERE email = $1',
//       [email]
//     );
//
//     res.status(200).json({ message: 'Phone verified successfully.' });
//   } catch (error) {
//     console.error('Verify Phone Error:', error);
//     res.status(500).json({ message: 'Server error during phone verification.' });
//   }
// });

// ============================================
// POST /api/signup/complete
// Checks both verified, marks account as fully verified
// ============================================
app.post('/api/signup/complete', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ message: 'Email is required.' });
  }

  try {
    const result = await pool.query(
      'SELECT id, is_email_verified FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ message: 'Session expired. Please sign up again.' });
    }

    const user = result.rows[0];

    if (!user.is_email_verified) {
      return res.status(400).json({ message: 'Please verify your email first.' });
    }
    // ===== PHONE VERIFICATION DISABLED (Twilio is paid) — uncomment when ready =====
    // if (!user.is_phone_verified) {
    //   return res.status(400).json({ message: 'Please verify your phone number first.' });
    // }

    await pool.query(
      'UPDATE users SET is_verified = TRUE WHERE email = $1',
      [email]
    );

    // Fetch final user details to return
    const finalUser = await pool.query(
      'SELECT id, username, email FROM users WHERE email = $1',
      [email]
    );

    res.status(200).json({
      message: 'Account created successfully!',
      user: finalUser.rows[0],
    });
  } catch (error) {
    console.error('Complete Signup Error:', error);
    res.status(500).json({ message: 'Server error during account creation.' });
  }
});

// ============================================
// POST /api/signin
// Verifies email/username + password credentials
// Returns masked phone for OTP method selection
// ============================================
app.post('/api/signin', async (req, res) => {
  const { identifier, password } = req.body;

  if (!identifier || !password) {
    return res.status(400).json({ message: 'Email/username and password are required.' });
  }

  try {
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
      // ===== PHONE VERIFICATION DISABLED (Twilio is paid) — uncomment when ready =====
      // maskedPhone: user.phone_number ? maskPhone(user.phone_number) : null,
      maskedPhone: null,
    });
  } catch (error) {
    console.error('Signin Error:', error.message);
    res.status(500).json({ message: 'Server error. Please try again later.' });
  }
});

// ============================================
// POST /api/signin/send-otp
// Sends sign-in OTP via email or phone
// ============================================
app.post('/api/signin/send-otp', async (req, res) => {
  const { email } = req.body;
  const channel = (req.body.channel || req.body.method || '').trim().toLowerCase();

  console.log('send-otp called — email:', email, '| channel:', JSON.stringify(channel), '| full body:', JSON.stringify(req.body));

  if (!email || !channel) {
    return res.status(400).json({ message: 'Email and channel are required.' });
  }

  try {
    const result = await pool.query(
      'SELECT id, email, phone_number FROM users WHERE email = $1 AND is_verified = TRUE',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ message: 'User not found.' });
    }

    const user = result.rows[0];
    const otp = generateOtp();
    const expiresAt = otpExpiry(10);

    if (channel === 'email') {
      await pool.query(
        'UPDATE users SET signin_otp = $1, signin_otp_expires_at = $2 WHERE email = $3',
        [otp, expiresAt, email]
      );
      try {
        await sendEmailOtp(email, otp, 'Your Sign In Verification Code', 'Sign In Verification');
      } catch (emailErr) {
        console.error('Sign-in Email Error:', emailErr);
        return res.status(500).json({ message: 'Failed to send verification email.' });
      }
      console.log('Sign-in email OTP sent to:', email);
      res.status(200).json({ message: 'OTP sent to your email.' });
    // ===== PHONE VERIFICATION DISABLED (Twilio is paid) — uncomment when ready =====
    // } else if (channel === 'phone') {
    //   if (!user.phone_number) {
    //     return res.status(400).json({ message: 'No phone number associated with this account.' });
    //   }
    //   await pool.query(
    //     'UPDATE users SET signin_phone_otp = $1, signin_phone_otp_expires_at = $2 WHERE email = $3',
    //     [otp, expiresAt, email]
    //   );
    //   try {
    //     await sendSmsOtp(user.phone_number, otp, 'Your sign-in verification code');
    //   } catch (smsErr) {
    //     console.error('Sign-in SMS Error:', smsErr.message);
    //     return res.status(500).json({ message: 'Failed to send SMS code. Please verify your phone number.' });
    //   }
    //   console.log('Sign-in phone OTP sent to:', user.phone_number);
    //   res.status(200).json({ message: 'OTP sent to your phone.' });
    } else {
      return res.status(400).json({ message: 'Invalid channel. Use "email".' });
    }
  } catch (error) {
    console.error('Send Sign-In OTP Error:', error.message);
    res.status(500).json({ message: 'Server error. Please try again later.' });
  }
});

// ============================================
// POST /api/signin/verify-otp
// Verifies sign-in OTP (email or phone)
// ============================================
app.post('/api/signin/verify-otp', async (req, res) => {
  const { email, otp } = req.body;
  const channel = (req.body.channel || req.body.method || '').trim().toLowerCase();

  console.log('verify-otp called — email:', email, '| otp:', otp, '| channel:', JSON.stringify(channel));

  if (!email || !otp || !channel) {
    return res.status(400).json({ message: 'Email, OTP, and channel are required.' });
  }

  try {
    const result = await pool.query(
      // ===== PHONE VERIFICATION DISABLED (Twilio is paid) — uncomment when ready =====
      // 'SELECT id, username, email, signin_otp, signin_otp_expires_at, signin_phone_otp, signin_phone_otp_expires_at FROM users WHERE email = $1',
      'SELECT id, username, email, signin_otp, signin_otp_expires_at FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ message: 'User not found.' });
    }

    const user = result.rows[0];

    if (channel === 'email') {
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
    // ===== PHONE VERIFICATION DISABLED (Twilio is paid) — uncomment when ready =====
    // } else if (channel === 'phone') {
    //   if (new Date() > new Date(user.signin_phone_otp_expires_at)) {
    //     return res.status(400).json({ message: 'OTP has expired. Please request a new one.' });
    //   }
    //   if (user.signin_phone_otp !== otp) {
    //     return res.status(400).json({ message: 'Invalid OTP. Please try again.' });
    //   }
    //   await pool.query(
    //     'UPDATE users SET signin_phone_otp = NULL, signin_phone_otp_expires_at = NULL WHERE email = $1',
    //     [email]
    //   );
    } else {
      return res.status(400).json({ message: 'Invalid channel.' });
    }

    res.status(200).json({
      message: 'Sign-in successful!',
      user: { id: user.id, username: user.username, email: user.email },
    });
  } catch (error) {
    console.error('Verify Sign-In OTP Error:', error.message);
    res.status(500).json({ message: 'Server error during verification.' });
  }
});

// ============================================
// POST /api/signin/forgot-password/lookup
// Looks up user, returns masked email + phone
// ============================================
app.post('/api/signin/forgot-password/lookup', async (req, res) => {
  const { identifier } = req.body;

  if (!identifier) {
    return res.status(400).json({ message: 'Email or username is required.' });
  }

  try {
    const isEmail = identifier.includes('@');
    const result = await pool.query(
      isEmail
        ? 'SELECT id, email FROM users WHERE email = $1 AND is_verified = TRUE'
        : 'SELECT id, email FROM users WHERE username = $1 AND is_verified = TRUE',
      [identifier]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ message: 'No verified account found.' });
    }

    const user = result.rows[0];
    res.status(200).json({
      email: user.email,
      maskedEmail: maskEmail(user.email),
      // ===== PHONE VERIFICATION DISABLED (Twilio is paid) — uncomment when ready =====
      // maskedPhone: user.phone_number ? maskPhone(user.phone_number) : null,
      maskedPhone: null,
    });
  } catch (error) {
    console.error('Forgot Password Lookup Error:', error.message);
    res.status(500).json({ message: 'Server error. Please try again later.' });
  }
});

// ============================================
// POST /api/signin/forgot-password/send-otp
// Sends password reset OTP via email or phone
// ============================================
app.post('/api/signin/forgot-password/send-otp', async (req, res) => {
  const { email } = req.body;
  const channel = (req.body.channel || req.body.method || '').trim().toLowerCase();

  console.log('forgot-password send-otp — email:', email, '| channel:', JSON.stringify(channel));

  if (!email || !channel) {
    return res.status(400).json({ message: 'Email and channel are required.' });
  }

  try {
    const result = await pool.query(
      'SELECT id, email, phone_number FROM users WHERE email = $1 AND is_verified = TRUE',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ message: 'No verified account found with this email.' });
    }

    const user = result.rows[0];
    const otp = generateOtp();
    const expiresAt = otpExpiry(10);

    if (channel === 'email') {
      await pool.query(
        'UPDATE users SET reset_otp = $1, reset_otp_expires_at = $2 WHERE email = $3',
        [otp, expiresAt, email]
      );
      try {
        await sendEmailOtp(email, otp, 'Your Password Reset Code', 'Password Reset');
      } catch (emailErr) {
        console.error('Forgot Password Email Error:', emailErr);
        return res.status(500).json({ message: 'Failed to send reset email.' });
      }
      console.log('Password reset email OTP sent to:', email);
      res.status(200).json({ message: 'Reset code sent to your email.' });
    // ===== PHONE VERIFICATION DISABLED (Twilio is paid) — uncomment when ready =====
    // } else if (channel === 'phone') {
    //   if (!user.phone_number) {
    //     return res.status(400).json({ message: 'No phone number associated with this account.' });
    //   }
    //   await pool.query(
    //     'UPDATE users SET reset_phone_otp = $1, reset_phone_otp_expires_at = $2 WHERE email = $3',
    //     [otp, expiresAt, email]
    //   );
    //   try {
    //     await sendSmsOtp(user.phone_number, otp, 'Your password reset code');
    //   } catch (smsErr) {
    //     console.error('Forgot Password SMS Error:', smsErr.message);
    //     return res.status(500).json({ message: 'Failed to send reset SMS.' });
    //   }
    //   console.log('Password reset phone OTP sent to:', user.phone_number);
    //   res.status(200).json({ message: 'Reset code sent to your phone.' });
    } else {
      return res.status(400).json({ message: 'Invalid method. Use "email".' });
    }
  } catch (error) {
    console.error('Forgot Password Send OTP Error:', error.message);
    res.status(500).json({ message: 'Server error. Please try again later.' });
  }
});

// ============================================
// POST /api/signin/forgot-password/verify-and-reset
// Verifies OTP and resets password
// ============================================
app.post('/api/signin/forgot-password/verify-and-reset', async (req, res) => {
  const { email, otp, newPassword } = req.body;
  const channel = (req.body.channel || req.body.method || '').trim().toLowerCase();

  if (!email || !otp || !channel || !newPassword) {
    return res.status(400).json({ message: 'All fields are required.' });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ message: 'Password must be at least 6 characters.' });
  }

  try {
    const result = await pool.query(
      // ===== PHONE VERIFICATION DISABLED (Twilio is paid) — uncomment when ready =====
      // 'SELECT id, reset_otp, reset_otp_expires_at, reset_phone_otp, reset_phone_otp_expires_at FROM users WHERE email = $1',
      'SELECT id, reset_otp, reset_otp_expires_at FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ message: 'User not found.' });
    }

    const user = result.rows[0];

    if (channel === 'email') {
      if (new Date() > new Date(user.reset_otp_expires_at)) {
        return res.status(400).json({ message: 'Reset code has expired. Please request a new one.' });
      }
      if (user.reset_otp !== otp) {
        return res.status(400).json({ message: 'Invalid reset code.' });
      }
    // ===== PHONE VERIFICATION DISABLED (Twilio is paid) — uncomment when ready =====
    // } else if (channel === 'phone') {
    //   if (new Date() > new Date(user.reset_phone_otp_expires_at)) {
    //     return res.status(400).json({ message: 'Reset code has expired. Please request a new one.' });
    //   }
    //   if (user.reset_phone_otp !== otp) {
    //     return res.status(400).json({ message: 'Invalid reset code.' });
    //   }
    } else {
      return res.status(400).json({ message: 'Invalid channel.' });
    }

    const newHash = await bcrypt.hash(newPassword, 10);

    await pool.query(
      `UPDATE users SET
        password_hash = $1,
        reset_otp = NULL, reset_otp_expires_at = NULL,
        reset_phone_otp = NULL, reset_phone_otp_expires_at = NULL
       WHERE email = $2`,
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
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const { sub: googleId, email, name } = payload;

    if (!email) {
      return res.status(400).json({ message: 'Could not retrieve email from Google.' });
    }

    const existingUser = await pool.query(
      'SELECT id, username, email, google_id, is_verified FROM users WHERE email = $1',
      [email]
    );

    let user;

    if (existingUser.rows.length > 0) {
      user = existingUser.rows[0];
      if (!user.google_id) {
        await pool.query(
          'UPDATE users SET google_id = $1, is_verified = TRUE WHERE email = $2',
          [googleId, email]
        );
      } else if (!user.is_verified) {
        await pool.query('UPDATE users SET is_verified = TRUE WHERE email = $1', [email]);
      }
    } else {
      const username = email.split('@')[0] + '_' + Math.floor(Math.random() * 1000);
      const fullName = name || email.split('@')[0];
      const insertResult = await pool.query(
        `INSERT INTO users (username, full_name, email, google_id, password_hash, is_verified)
         VALUES ($1, $2, $3, $4, '', TRUE)
         RETURNING id, username, email`,
        [username, fullName, email, googleId]
      );
      user = insertResult.rows[0];
    }

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

// CRITICAL FOR VERCEL: Export instead of app.listen()
module.exports = app;
