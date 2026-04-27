# Tatzo Payments Server (Local)

This server lets you use Razorpay on the Firebase Spark plan (no Cloud Functions) by running a small local / hosted Node server.

## Setup

1. Install

   cd server
   npm i

2. Create env file

   Copy .env.example to .env and fill values.

3. Run

   npm run dev

## Endpoints

- GET /health
- POST /api/razorpay/order
  body: { bookingId, amountRupees }
- POST /api/razorpay/verify
  body: { orderId, paymentId, signature }

## Hosted checkout page

- GET /pay?bookingId=...&amountRupees=249&name=...&email=...&phone=...

The page opens Razorpay Checkout in the browser and verifies the signature via /api/razorpay/verify.

