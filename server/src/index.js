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
const cleanEnvSecret = (value) => String(value || '').trim().replace(/^['"]|['"]$/g, '');
const KEY_ID = cleanEnvSecret(process.env.RAZORPAY_KEY_ID);
const KEY_SECRET = cleanEnvSecret(process.env.RAZORPAY_KEY_SECRET);
const PAYMENT_MODE = KEY_ID.startsWith('rzp_test_') ? 'test' : KEY_ID.startsWith('rzp_live_') ? 'live' : 'unknown';
console.log('TATZO: RAZORPAY_KEY_ID present?', Boolean(KEY_ID));
console.log('TATZO: RAZORPAY_KEY_SECRET present?', Boolean(KEY_SECRET));
console.log('TATZO: Razorpay mode', PAYMENT_MODE);
const DEEPLINK_SUCCESS = process.env.DEEPLINK_SUCCESS || '';
const SUBSCRIPTION_REGULAR_RUPEES = 1499;
const SUBSCRIPTION_BASE_RUPEES = 499;
const SUBSCRIPTION_GST_RATE = 0.18;
const SUBSCRIPTION_GST_RUPEES = Number((SUBSCRIPTION_BASE_RUPEES * SUBSCRIPTION_GST_RATE).toFixed(2));
const SUBSCRIPTION_TOTAL_RUPEES = Number((SUBSCRIPTION_BASE_RUPEES + SUBSCRIPTION_GST_RUPEES).toFixed(2));
const escapeHtml = (value) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

const getRazorpayErrorHint = (status, details) => {
  const description = details?.error?.description || details?.description || '';
  if (status === 401 || /authentication failed/i.test(description)) {
    return 'Razorpay authentication failed. Use a matching Key ID and Key Secret from the same Razorpay mode, then restart the Tatzo payment server.';
  }
  if (status === 400) {
    return description || 'Razorpay rejected this payment request. Check amount, receipt, and required customer fields.';
  }
  return 'Payment could not be started right now. Try again after checking the server logs.';
};

const renderPaymentErrorPage = ({ status, error, details }) => {
  const hint = getRazorpayErrorHint(status, details);
  const description = details?.error?.description || details?.description || '';
  const code = details?.error?.code || details?.code || '';
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Tatzo Payment Issue</title>
  <style>
    body{margin:0;font-family:Arial,Helvetica,sans-serif;background:#080b12;color:#f5f7fa;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:18px;box-sizing:border-box;}
    .card{width:min(560px,94vw);border:1px solid rgba(255,255,255,.12);border-radius:20px;padding:20px;background:linear-gradient(145deg,rgba(18,23,34,.96),rgba(12,8,22,.96));box-shadow:0 22px 46px rgba(0,0,0,.45)}
    .brand{letter-spacing:3px;font-weight:900;font-size:12px;color:#00e5ff;text-transform:uppercase}
    .title{font-size:22px;font-weight:900;margin:10px 0 8px}
    .hint{line-height:1.55;color:rgba(245,247,250,.84);font-size:14px;margin:0 0 14px}
    .box{border:1px solid rgba(255,93,122,.35);background:rgba(255,93,122,.10);border-radius:14px;padding:12px;margin-top:12px;color:#ffdbe2;font-size:13px;line-height:1.5;word-break:break-word}
    .fine{margin-top:14px;color:rgba(245,247,250,.62);font-size:12px;line-height:1.5}
    code{background:rgba(255,255,255,.08);border-radius:7px;padding:2px 6px;color:#fff}
  </style>
</head>
<body>
  <div class="card">
    <div class="brand">TATZO PAYMENTS</div>
    <div class="title">Payment could not start</div>
    <p class="hint">${escapeHtml(hint)}</p>
    <div class="box">
      Status: <b>${escapeHtml(status)}</b><br/>
      Mode: <b>${escapeHtml(PAYMENT_MODE.toUpperCase())}</b><br/>
      Error: ${escapeHtml(error)}${description ? `<br/>Razorpay: ${escapeHtml(description)}` : ''}${code ? `<br/>Code: ${escapeHtml(code)}` : ''}
    </div>
    <div class="fine">
      For test payments, keep both values from Razorpay Dashboard Test Mode: <code>RAZORPAY_KEY_ID</code> and <code>RAZORPAY_KEY_SECRET</code>. After changing <code>server/.env</code>, stop and restart <code>npm run dev</code> inside the server folder.
    </div>
  </div>
</body>
</html>`;
};

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

  const makeReceipt = (value) => {
    const candidate = String(value || '').trim();
    const fallback = `tatzo_${Date.now().toString(36)}`;
    if (!candidate) return fallback.slice(0, 40);

    const safe = `bk_${candidate}`
      .replace(/[^a-zA-Z0-9_]/g, '')
      .slice(0, 40);

    return safe.length >= 6 ? safe : fallback.slice(0, 40);
  };

  const body = {
    amount: amountPaise,
    currency: 'INR',
    receipt: makeReceipt(bookingId),
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

app.get('/health', (req, res) =>
  res.json({
    ok: true,
    service: 'tatzo-payments-server',
    razorpayMode: PAYMENT_MODE,
    keyPrefix: KEY_ID ? KEY_ID.slice(0, 9) : null,
  }),
);
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
      Razorpay mode: <b>${PAYMENT_MODE.toUpperCase()}</b><br/>
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
    res.json({ ok: verified, verified, localOnly: true, bookingUpdated: false });
  } catch (e) {
    next(e);
  }
});

app.get('/pay', async (req, res, next) => {
  try {
    const bookingId = String(req.query.bookingId || '').trim();
    const flow = String(req.query.flow || 'booking').trim();
    const requestedAmountRupees = Number(req.query.amountRupees || 249);
    const amountRupees = flow === 'subscription' ? SUBSCRIPTION_TOTAL_RUPEES : requestedAmountRupees;
    const name = String(req.query.name || 'Tatzo User');
    const email = String(req.query.email || '');
    const phone = String(req.query.phone || '');
    const returnUrlFromClient = String(req.query.returnUrl || '').trim();
    const uid = String(req.query.uid || '').trim();
    const paymentTitle = flow === 'subscription' ? 'Tatzo Pro subscription' : 'Booking deposit';
    const paymentDescription = flow === 'subscription' ? `Discount plan Rs.${SUBSCRIPTION_BASE_RUPEES} + GST Rs.${SUBSCRIPTION_GST_RUPEES}` : 'Booking deposit';

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
    .open-app{display:none;width:100%;text-align:center;margin-top:12px}
    .open-app a{display:inline-block;padding:11px 16px;border-radius:12px;border:1px solid rgba(0,229,255,.45);background:rgba(0,229,255,.12);text-decoration:none;color:#f5f7fa;font-weight:700}
    a{color:#00e5ff}
  </style>
</head>
<body>
  <div class="card">
    <div class="brand">TATZO</div>
    <div class="title">${safe(paymentTitle)}</div>
    <div class="muted">Amount: <b>Rs. ${safe(amountRupees)}</b>${flow === 'subscription' ? `<br/>Offer: <b>Regular Rs. ${SUBSCRIPTION_REGULAR_RUPEES}, now Rs. ${SUBSCRIPTION_BASE_RUPEES} + 18% GST (Rs. ${SUBSCRIPTION_GST_RUPEES})</b>` : ''}<br/>Booking: <b>${safe(bookingId || order.receipt)}</b><br/>Mode: <b>${safe(PAYMENT_MODE.toUpperCase())}</b></div>
    <button class="btn" id="payBtn">Pay now</button>
    <div class="fine">Test mode supported. Do not close this tab until you see Success.</div>
    <div class="status" id="status"></div>
    <div class="open-app" id="openAppWrap"><a id="openAppLink" href="#">Open Tatzo App</a></div>
  </div>

  <script src="https://checkout.razorpay.com/v1/checkout.js"></script>
  <script>
    const statusEl = document.getElementById('status');
    const setStatus = (msg) => { statusEl.textContent = msg; };
    const flow = ${JSON.stringify(flow)};
    const uid = ${JSON.stringify(uid)};

    const buildDeepLink = (base, params) => {
      if (!base) return '';
      const sep = base.includes('?') ? '&' : '?';
      const q = Object.entries(params)
        .filter(([, v]) => v !== undefined && v !== null && String(v) !== '')
        .map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(String(v)))
        .join('&');
      return base + sep + q;
    };

    const options = {
      key: ${JSON.stringify(order.keyId)},
      amount: ${JSON.stringify(order.amount)},
      currency: ${JSON.stringify(order.currency)},
      name: 'Tatzo',
      description: ${JSON.stringify(paymentDescription)},
      order_id: ${JSON.stringify(order.orderId)},
      prefill: { name: ${JSON.stringify(name)}, email: ${JSON.stringify(email)}, contact: ${JSON.stringify(phone)} },
      theme: { color: '#7A5CFF' },
      method: {
        upi: true,
        card: true,
        netbanking: true,
        wallet: true
      },
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

          const deepBase = ${JSON.stringify(returnUrlFromClient)} || ${JSON.stringify(DEEPLINK_SUCCESS)};
          if (deepBase) {
            const url = buildDeepLink(deepBase, {
              bookingId: ${JSON.stringify(bookingId)},
              orderId: resp.razorpay_order_id,
              paymentId: resp.razorpay_payment_id,
              signature: resp.razorpay_signature,
              status: 'success',
              flow,
              uid
            });

            const openWrap = document.getElementById('openAppWrap');
            const openLink = document.getElementById('openAppLink');
            if (openLink) openLink.href = url;
            if (openWrap) openWrap.style.display = 'block';

            // Try auto-open first.
            window.location.assign(url);
            // If blocked, user can tap Open Tatzo App button.
            setTimeout(() => {
              setStatus('Payment verified. If app did not open, tap "Open Tatzo App".');
            }, 900);
          }
        } catch (e) {
          setStatus('Error: ' + (e && e.message ? e.message : String(e)));
        }
      },
      modal: {
        ondismiss: function(){
          setStatus('Payment cancelled.');
          const deepBase = ${JSON.stringify(returnUrlFromClient)} || ${JSON.stringify(DEEPLINK_SUCCESS)};
          if (!deepBase) return;
          const url = buildDeepLink(deepBase, {
            bookingId: ${JSON.stringify(bookingId)},
            status: 'cancelled',
            flow,
            uid
          });
          const openWrap = document.getElementById('openAppWrap');
          const openLink = document.getElementById('openAppLink');
          if (openLink) openLink.href = url;
          if (openWrap) openWrap.style.display = 'block';
          setTimeout(() => {
            window.location.assign(url);
          }, 250);
        }
      }
    };

    let checkoutOpened = false;
    const openCheckout = () => {
      if (checkoutOpened) return;
      checkoutOpened = true;
      setStatus('Opening Razorpay Checkout...');
      const rzp = new Razorpay(options);
      rzp.open();
    };

    document.getElementById('payBtn').addEventListener('click', openCheckout);
    // Auto-open once page is ready (fallback button still available).
    window.addEventListener('load', () => {
      setTimeout(openCheckout, 250);
    });
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
    razorpayMode: PAYMENT_MODE,
    keyPrefix: KEY_ID ? KEY_ID.slice(0, 9) : null,
  };

  const wantsHtml = req.path === '/pay' || String(req.headers.accept || '').includes('text/html');
  if (wantsHtml) {
    res.status(status).setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(renderPaymentErrorPage({ status, error: body.error, details: body.details }));
    return;
  }

  res.status(status).json(body);
});
app.listen(PORT, () => {
  console.log(`tatzo-payments-server running on http://localhost:${PORT}`);
});

