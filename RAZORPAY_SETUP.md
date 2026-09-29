# Razorpay test-mode setup

The browser checkout uses the provided **test publishable key ID** from `js/batches.js`. The Razorpay secret key must never be placed in HTML or browser JavaScript.

## Current behavior

- Free batches create an active `batch_enrollments` row immediately.
- Paid batches open Razorpay Checkout in test mode.
- After Checkout returns, the app stores the payment ID in `batch_payments` and creates an active enrollment with `verification_pending` status.

## Production verification

For production, add a Supabase Edge Function (or another server-side endpoint) that:

1. Creates a Razorpay order using the secret key stored as a server secret.
2. Returns the order ID to the browser.
3. Verifies `razorpay_signature` with HMAC-SHA256 using the secret.
4. Marks `batch_payments.status = 'captured'` only after server-side verification.
5. Grants the enrollment from the verified server path.

Do not commit the secret key. Rotate it in Razorpay if it has been shared outside a secure secret manager.
