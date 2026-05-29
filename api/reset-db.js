const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function resetTable() {
  try {
    await pool.query('DROP TABLE IF EXISTS users');
    await pool.query(`
      CREATE TABLE users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL,
        full_name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        phone_number VARCHAR(50) UNIQUE NULL,
        password_hash VARCHAR(255) NOT NULL,

        -- Signup Email OTP
        otp VARCHAR(6) NULL,
        otp_expires_at TIMESTAMP NULL,
        is_email_verified BOOLEAN DEFAULT FALSE,

        -- Signup Phone OTP
        phone_otp VARCHAR(6) NULL,
        phone_otp_expires_at TIMESTAMP NULL,
        is_phone_verified BOOLEAN DEFAULT FALSE,

        -- Fully verified account flag
        is_verified BOOLEAN DEFAULT FALSE,

        -- Sign-in OTP (Email)
        signin_otp VARCHAR(6) NULL,
        signin_otp_expires_at TIMESTAMP NULL,

        -- Sign-in OTP (Phone)
        signin_phone_otp VARCHAR(6) NULL,
        signin_phone_otp_expires_at TIMESTAMP NULL,

        -- Password Reset OTP (Email)
        reset_otp VARCHAR(6) NULL,
        reset_otp_expires_at TIMESTAMP NULL,

        -- Password Reset OTP (Phone)
        reset_phone_otp VARCHAR(6) NULL,
        reset_phone_otp_expires_at TIMESTAMP NULL,

        -- Google OAuth
        google_id VARCHAR(255) NULL,

        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('SUCCESS: Table recreated with phone number support.');
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}
resetTable();
