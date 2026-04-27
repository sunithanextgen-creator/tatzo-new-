import crypto from 'crypto';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Always load server/.env no matter where the process is started from
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const app = express();
app.use(cors());
app.use(express.json());

const PORT = Number(process.env.PORT || 5055);
console.log('TATZO: loaded env from', path.join(__dirname, '..', '.env'));
const KEY_ID = process.env.RAZORPAY_KEY_ID || '';
const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || '';
console.log('TATZO: RAZORPAY_KEY_ID present?', Boolean(KEY_ID));
console.log('TATZO: RAZORPAY_KEY_SECRET present?', Boolean(KEY_SECRET));
const DEEPLINK_SUCCESS = process.env.DEEPLINK_SUCCESS || '';

const assertConfigured = () => {
  if (!KEY_ID || !KEY_SECRET) {
    const err = new Error('Missing Razorpay keys. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in server/.env');
    // @ts-ignore
    err.statusCode = 500;
    throw err;
  }
};

const razorpayFetch = async (path, options) => {
  assertConfigured();
  const auth = Buffer.from(`${KEY_ID}:${KEY_SECRET}`).toString('base64');
  const res = await fetch(`https://api.razorpay.com/v1${path}`,
    {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${auth}`,
        ...(options?.headers || {}),
      },
    },
  );

  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }

  if (!res.ok) {
    const err = new Error(`Razorpay API error (${res.status})`);
    // @ts-ignore
    err.statusCode = res.status;
    // @ts-ignore
    err.details = json;
    throw err;
  }

  return json;
};

const createOrder = async ({ bookingId, amountRupees }) => {
  const amountPaise = Math.round(Number(amountRupees) * 100);
  if (!Number.isFinite(amountPaise) || amountPaise < 100) {
    const err = new Error('Invalid amountRupees');
    // @ts-ignore
    err.statusCode = 400;
    throw err;
  }

  const body = {
    amount: amountPaise,
    currency: 'INR',
    receipt: bookingId ? `booking_${bookingId}` : `tatzo_${Date.now()}`,
    notes: bookingId ? { bookingId } : {},
  };

  const order = await razorpayFetch('/orders', {
    method: 'POST',
    body: JSON.stringify(body),
  });

  return {
    keyId: KEY_ID,
    orderId: order.id,
    amount: order.amount,
    currency: order.currency,
    receipt: order.receipt,
  };
};

const verifySignature = ({ orderId, paymentId, signature }) => {
  assertConfigured();
  const payload = `${orderId}|${paymentId}`;
  const expected = crypto.createHmac('sha256', KEY_SECRET).update(payload).digest('hex');
  return expected === signature;
};

app.get('/health', (req, res) => res.json({ ok: true, service: 'tatzo-payments-server' }));
app.get('/', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Tatzo Payments Server</title>
  <style>
    body{margin:0;font-family:Arial,Helvetica,sans-serif;background:#0b0b0f;color:#f5f7fa;display:flex;align-items:center;justify-content:center;min-height:100vh;}
    .card{width:min(680px,92vw);border:1px solid rgba(255,255,255,.10);border-radius:18px;padding:18px;background:rgba(255,255,255,.04);box-shadow:0 18px 34px rgba(0,0,0,.35)}
    .brand{letter-spacing:3px;font-weight:800;font-size:12px;color:#7a5cff;text-transform:uppercase}
    .title{font-size:20px;font-weight:800;margin:10px 0 6px}
    .muted{color:rgba(245,247,250,.75);font-size:13px;line-height:1.55}
    a{color:#00e5ff}
    code{background:rgba(255,255,255,.06);padding:2px 6px;border-radius:8px}
  </style>
</head>
<body>
  <div class="card">
    <div class="brand">TATZO</div>
    <div class="title">Payments server is running</div>
    <div class="muted">
      Try: <a href="/health">/health</a><br/>
      Try: <code>/pay?bookingId=test123&amp;amountRupees=249&amp;name=Tatzo%20User&amp;email=test@mail.com&amp;phone=9999999999</code><br/>
      Open: <a href="/pay?bookingId=test123&amp;amountRupees=249&amp;name=Tatzo%20User&amp;email=test@mail.com&amp;phone=9999999999">Pay (test)</a>
    </div>
  </div>
</body>
</html>`);
});
// Some Chrome/DevTools variants probe this path; respond cleanly.
app.get('/.well-known/appspecific/com.chrome.devtools.json', (req, res) => {
  res.json({});
});

app.post('/api/razorpay/order', async (req, res, next) => {
  try {
    const { bookingId, amountRupees } = req.body || {};
    const order = await createOrder({ bookingId, amountRupees });
    res.json(order);
  } catch (e) {
    next(e);
  }
});

app.post('/api/razorpay/verify', (req, res, next) => {
  try {
    const { orderId, paymentId, signature } = req.body || {};
    if (!orderId || !paymentId || !signature) {
      return res.status(400).json({ verified: false, error: 'Missing fields' });
    }
    const verified = verifySignature({ orderId, paymentId, signature });
    res.json({ verified });
  } catch (e) {
    next(e);
  }
});

app.get('/pay', async (req, res, next) => {
  try {
    const bookingId = String(req.query.bookingId || '').trim();
    const amountRupees = Number(req.query.amountRupees || 249);
    const name = String(req.query.name || 'Tatzo User');
    const email = String(req.query.email || '');
    const phone = String(req.query.phone || '');

    const order = await createOrder({ bookingId, amountRupees });

    const safe = (s) => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

    const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Tatzo Payment</title>
  <style>
    body{margin:0;font-family:Arial,Helvetica,sans-serif;background:#0b0b0f;color:#f5f7fa;display:flex;align-items:center;justify-content:center;min-height:100vh;}
    .card{width:min(520px,92vw);border:1px solid rgba(255,255,255,.10);border-radius:18px;padding:18px;background:rgba(255,255,255,.04);box-shadow:0 18px 34px rgba(0,0,0,.35)}
    .brand{letter-spacing:3px;font-weight:800;font-size:12px;color:#7a5cff;text-transform:uppercase}
    .title{font-size:20px;font-weight:800;margin:10px 0 6px}
    .muted{color:rgba(245,247,250,.75);font-size:13px;line-height:1.55}
    .btn{width:100%;border:none;border-radius:14px;padding:14px 16px;margin-top:14px;font-weight:800;cursor:pointer;background:linear-gradient(90deg,#00e5ff,#7a5cff);color:#0b0b0f}
    .fine{margin-top:10px;font-size:12px;color:rgba(245,247,250,.6)}
    .status{margin-top:14px;font-size:13px;white-space:pre-wrap}
    a{color:#00e5ff}
  </style>
</head>
<body>
  <div class="card">
    <div class="brand">TATZO</div>
    <div class="title">Booking deposit</div>
    <div class="muted">Amount: <b>Rs. ${safe(amountRupees)}</b><br/>Booking: <b>${safe(bookingId || order.receipt)}</b></div>
    <button class="btn" id="payBtn">Pay now</button>
    <div class="fine">Test mode supported. Do not close this tab until you see Success.</div>
    <div class="status" id="status"></div>
  </div>

  <script src="https://checkout.razorpay.com/v1/checkout.js"></script>
  <script>
    const statusEl = document.getElementById('status');
    const setStatus = (msg) => { statusEl.textContent = msg; };

    const options = {
      key: ${JSON.stringify(order.keyId)},
      amount: ${JSON.stringify(order.amount)},
      currency: ${JSON.stringify(order.currency)},
      name: 'Tatzo',
      description: 'Booking deposit',
      order_id: ${JSON.stringify(order.orderId)},
      prefill: { name: ${JSON.stringify(name)}, email: ${JSON.stringify(email)}, contact: ${JSON.stringify(phone)} },
      theme: { color: '#7A5CFF' },
      handler: async function (resp) {
        try {
          setStatus('Verifying payment...');
          const r = await fetch('/api/razorpay/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ orderId: resp.razorpay_order_id, paymentId: resp.razorpay_payment_id, signature: resp.razorpay_signature })
          });
          const j = await r.json();
          if (!j.verified) {
            setStatus('Verification failed. Please contact support.');
            return;
          }
          setStatus('Success. Payment verified. You can return to the app.');

          const deep = ${JSON.stringify(DEEPLINK_SUCCESS)};
          if (deep) {
            const url = deep + '?bookingId=' + encodeURIComponent(${JSON.stringify(bookingId)}) +
              '&orderId=' + encodeURIComponent(resp.razorpay_order_id) +
              '&paymentId=' + encodeURIComponent(resp.razorpay_payment_id) +
              '&signature=' + encodeURIComponent(resp.razorpay_signature) +
              '&status=success';
            window.location.href = url;
          }
        } catch (e) {
          setStatus('Error: ' + (e && e.message ? e.message : String(e)));
        }
      },
      modal: {
        ondismiss: function(){ setStatus('Payment cancelled.'); }
      }
    };

    const openCheckout = () => {
      setStatus('Opening Razorpay Checkout...');
      const rzp = new Razorpay(options);
      rzp.open();
    };

    document.getElementById('payBtn').addEventListener('click', openCheckout);
  </script>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (e) {
    next(e);
  }
});

app.use((err, req, res, next) => {
  const status = err?.statusCode && Number.isFinite(err.statusCode) ? err.statusCode : 500;
  const body = {
    error: err?.message || 'Server error',
    details: err?.details || null,
  };
  res.status(status).json(body);
});

app.listen(PORT, () => {
  console.log(`tatzo-payments-server running on http://localhost:${PORT}`);
});




