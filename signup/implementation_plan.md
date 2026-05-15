# Serverless Authentication System Implementation Plan

This document serves as the master blueprint for building a fully secure, serverless authentication system using Vanilla HTML/JS, Vercel Serverless Functions, and a Neon PostgreSQL database.

## Architecture Overview

- **Frontend:** Vanilla HTML5, CSS3, and JavaScript (`fetch` API). Hosted on Vercel.
- **Backend:** Node.js Express framework, adapted for Vercel Serverless Functions.
- **Database:** Serverless PostgreSQL hosted on Neon (`console.neon.tech`).
- **Email Service:** SendGrid API (Professional, free serverless email provider giving 100 free emails/day forever. Does not require personal email).

---

## 1. Environment Variables & Setup

Create a `.env` file at the root of the project with these exact credentials. **The model must use these environment variables.**

```env
DATABASE_URL="your-neon-connection-string-here"
SENDGRID_API_KEY="your-sendgrid-api-key-here"
```

---

## 2. Database Configuration (Neon)

Since the environment is serverless, the database acts as the single source of truth, not just for accounts, but for temporary session states (like OTPs).

### Schema: `users` Table
The backend will automatically create this table or you must run this SQL in your Neon console:
```sql
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  otp VARCHAR(6) NULL,
  otp_expires_at TIMESTAMP NULL,
  is_verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```
*Note: `is_verified` ensures unverified accounts cannot log in, and allows the system to overwrite temporary accounts if an OTP expires.*

---

## 3. Backend Infrastructure (Vercel Serverless)

The backend code must be restructured into an `api/` directory to adhere to Vercel's serverless requirements.

### Dependencies
Run: `npm install express pg bcrypt @sendgrid/mail cors dotenv`

### File Structure & Changes

#### [NEW] `vercel.json`
Required at the root level to route API traffic.
```json
{
  "rewrites": [
    { "source": "/api/(.*)", "destination": "/api/index.js" }
  ]
}
```

#### [MODIFY] `api/db.js`
Initializes the PostgreSQL connection pool using `pg`.
- Must use `process.env.DATABASE_URL`.
- Must include `ssl: { rejectUnauthorized: false }` to connect securely to Neon.

#### [NEW] `api/index.js` (The Core Serverless API)
This replaces the traditional `server.js`.
- **Initialization:** Import `express`, configure `cors`, parse JSON, and initialize the `@sendgrid/mail` SDK using `sgMail.setApiKey(process.env.SENDGRID_API_KEY)`.
- **Vercel Export:** Instead of `app.listen()`, the file **MUST** end with `module.exports = app;`.

**Endpoint 1: `POST /api/signup`**
1. Extract `email`, `username`, `password` from the request body.
2. **Validation:** Query Neon for the `email`.
   - If user exists AND `is_verified === true`, return `400 "Account already exists"`.
   - If user exists but `is_verified === false`, proceed (they are retrying).
3. **Cryptography:** Hash the `password` using `bcrypt` (10 salt rounds).
4. **OTP Generation:** Generate a 6-digit string using `crypto.randomInt(100000, 999999).toString()`.
5. **Expiration:** Calculate timestamp for `NOW() + 10 minutes`.
6. **Database Write:** Use `INSERT ... ON CONFLICT (email) DO UPDATE` to save the user, the hashed password, the OTP, and the expiration time.
7. **Email Dispatch:** Use the `@sendgrid/mail` SDK (`sgMail.send()`) to send the OTP email from your verified SendGrid domain.
8. **Response:** Return `200 OK`.

**Endpoint 2: `POST /api/verify`**
1. Extract `email`, `otp` from the request body.
2. **Validation:** Query Neon for the user by `email`.
   - If no user found, return `400 "Session expired"`.
   - If `current_timestamp > otp_expires_at`, return `400 "OTP Expired"`.
   - If DB `otp !== request otp`, return `400 "Invalid OTP"`.
3. **Database Write:** Run an `UPDATE` query:
   - Set `is_verified = TRUE`.
   - Set `otp = NULL` and `otp_expires_at = NULL` (for security).
4. **Response:** Return `200 OK`.

---

## 4. Frontend Implementation

### [MODIFY] `signup/signup.html`
A Single Page Application (SPA) feel using Vanilla JS to handle two forms without page reloads.

**UI Elements:**
- **Step 1 (Details Container):** Inputs for Username, Email, Password, Confirm Password.
- **Step 2 (OTP Container):** Hidden by default (`display: none`). Contains a 6-digit text input.
- **Error Messages:** Blank `<p>` tags to inject validation errors dynamically.

**JavaScript Logic (`<script>` tag inside signup.html):**
1. **Step 1 Submit Event:**
   - Prevent default form submission.
   - Validate passwords match.
   - Disable submit button (to prevent double-clicks).
   - Use `fetch()` to send `POST` request to `/api/signup`.
   - **On Success:** Hide Step 1 container, unhide Step 2 container.
   - **On Error:** Re-enable button, display error text.
2. **Step 2 Submit Event:**
   - Prevent default.
   - Use `fetch()` to send `POST` request to `/api/verify` (passing email from Step 1 and the OTP).
   - **On Success:** Show JavaScript `alert("Account Verified!")`, then `window.location.href = '../signin/signin.html'`.

### [MODIFY] `style.css`
- Add `.hidden { display: none; }` utility class.
- Style the forms to be clean and modern.
