# Sign-in Page Implementation Plan (For Claude Opus)

This document contains the specific requirements and context for building the **Sign-in Page**. Claude Opus should use this as the primary reference for implementing the UI and integrating the backend logic for this specific feature.

## Scope of Work
- **Focus**: This task is strictly for the **Sign-in page**. Do not build or modify the Sign-up page (another developer is handling that).
- **Database**: The project uses **Neon** (Serverless PostgreSQL). The database architecture and setup are being handled externally. When database operations are required, leave placeholders or prompt the user for the specific connection snippet/schema details.

## UI/UX Requirements
1. **Password Field Layout**:
   - The UI must have a clean, modern input field for the password.
   - Directly **below** the password text input box, there must be two distinct links/buttons:
     - **Left side**: "Forget Email"
     - **Right side**: "Forget Password"

## Core Features & Logic
1. **OTP Verification Integration**:
   - The sign-in flow requires a multi-factor/account verification step.
   - Users must verify their identity via an **OTP (One-Time Password)** before fully logging in.
   - The user must be presented with the option to receive this OTP via:
     - **Email**
     - **Mobile Number (SMS)**

## Instructions for Claude Opus
- **UI First**: Begin by scaffolding the HTML/CSS/JS (or relevant framework components) for the Sign-in page based on the layout requirements above.
- **Backend/Logic**: Implement the logic to trigger the OTP flow upon a successful initial credential check.
- **Service Integration**: Prompt the user to clarify which third-party services they want to use for sending the OTPs (e.g., Twilio for SMS, Resend/Nodemailer for Email) so you can implement the correct APIs.
- **Database Integration**: Once the UI and OTP logic are ready, ask the user to provide the Neon Database connection string and the schema for verifying users so you can wire up the actual authentication queries.
