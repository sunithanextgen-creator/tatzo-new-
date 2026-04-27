# Inkova - Tattoo Marketplace App

## 🚀 Quick Start

```
cd inkova-new
npm install
npm run dev
```

**Live:** http://localhost:5173

## 🎨 Features

- **Cyberpunk Neon UI** - Glassmorphism, animations, responsive
- **Role-Based Access** - User/Artist/Dealer dashboards
- **Mock Firebase** - Full auth/role flow (no real deps)
- **Mobile-First** - Perfect on all screens
- **Production Ready** - Clean, zero warnings

## 📱 Flow

```
Login → Onboarding → Select Role → Protected Dashboard
```

**Demo:** Click Login → auto-login → select Artist → Artist Dashboard

## 🔧 Structure

```
src/
├── App.jsx          - Router + ProtectedRoute
├── pages/           - Login, Register, RoleSelect, Dashboards
├── components/      - ProtectedRoute.jsx
├── index.css        - Cyberpunk theme + glassmorphism
└── services/        - firebase.js (mock)
```

## 🎯 Swap to Real Firebase

Replace `src/services/firebase.js` mock with real config.

## 📱 Mobile Optimized

- Responsive typography
- Touch-friendly cards
- Optimized padding/spacing

## Zero Dependencies Issues

- Vite + React 19
- No external deps beyond react-router-dom
- Mock Firebase = instant demo

**Built for production deployment.**

## Razorpay Backend (Firebase Functions)

This repo includes a backend scaffold in `functions/` for Razorpay payments.

### What it does
- `createOrder`: creates a Razorpay order for an existing Firestore booking in `bookings/{bookingId}`.
- `verifyPayment`: verifies Razorpay signature and marks the booking as paid.

### Environment variables (set later)
These must be configured in the Functions runtime (do not put secrets inside the mobile app):
- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`

### Local setup (later)
```bash
cd functions
npm i
npm run build
```

### Deploy (later)
```bash
cd functions
npm run deploy
```

## TATZO Admin Portal (New)

### Run Admin Web (local)
```bash
cd admin-web
npm install
npm run dev
```

### Build Admin Web (for Firebase Hosting)
```bash
cd admin-web
npm run build
```

### Set Admin Custom Claim
```bash
# PowerShell
$env:FIREBASE_SERVICE_ACCOUNT="C:\path\to\service-account.json"
npm run set-admin-claim -- <admin-email-or-uid>
```

After setting claim, sign out + sign in again in admin web portal.

### Deploy Rules + Hosting
```bash
npx firebase deploy --only firestore:rules,storage,hosting
```
