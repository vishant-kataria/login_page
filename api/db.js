const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Prevent idle clients from crashing the process when network connection is lost or timed out
pool.on('error', (err) => {
  console.error('Unexpected error on idle database client:', err.message || err);
});

const initDb = async () => {
  try {
    // Base table (signup columns)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL,
        full_name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        otp VARCHAR(6) NULL,
        otp_expires_at TIMESTAMP NULL,
        is_verified BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Add sign-in specific columns (safe to run on existing tables)
    const newColumns = [
      { name: 'phone', type: 'VARCHAR(15) NULL' },
      { name: 'phone_number', type: 'VARCHAR(50) UNIQUE NULL' },
      { name: 'is_email_verified', type: 'BOOLEAN DEFAULT FALSE' },
      { name: 'phone_otp', type: 'VARCHAR(6) NULL' },
      { name: 'phone_otp_expires_at', type: 'TIMESTAMP NULL' },
      { name: 'is_phone_verified', type: 'BOOLEAN DEFAULT FALSE' },
      { name: 'signin_otp', type: 'VARCHAR(6) NULL' },
      { name: 'signin_otp_expires_at', type: 'TIMESTAMP NULL' },
      { name: 'signin_phone_otp', type: 'VARCHAR(6) NULL' },
      { name: 'signin_phone_otp_expires_at', type: 'TIMESTAMP NULL' },
      { name: 'reset_otp', type: 'VARCHAR(6) NULL' },
      { name: 'reset_otp_expires_at', type: 'TIMESTAMP NULL' },
      { name: 'reset_phone_otp', type: 'VARCHAR(6) NULL' },
      { name: 'reset_phone_otp_expires_at', type: 'TIMESTAMP NULL' },
      { name: 'google_id', type: 'VARCHAR(255) NULL' },
    ];

    // Make password_hash nullable for Google OAuth users (who don't have passwords)
    await pool.query(`
      DO $$ BEGIN
        ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
      EXCEPTION
        WHEN others THEN NULL;
      END $$;
    `);

    for (const col of newColumns) {
      await pool.query(`
        DO $$ BEGIN
          ALTER TABLE users ADD COLUMN ${col.name} ${col.type};
        EXCEPTION
          WHEN duplicate_column THEN NULL;
        END $$;
      `);
    }

    console.log('Database initialized: users table is ready with all columns.');
  } catch (err) {
    console.error('Error initializing database:', err);
  }
};

initDb();

module.exports = pool;
