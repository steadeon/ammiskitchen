// Talking to PayPal (Orders v2 REST API) from the Worker. No PayPal library: just fetch.
//
// How a payment goes:
//   1. The customer fills in the order form and picks "Pay now". PayPal's buttons on the page ask the
//      Worker (POST /api/order) to save the order, unpaid, and create a PayPal order for the price
//      Sanity says (never the browser's price). The PayPal order carries our Sanity order ID.
//   2. The customer pays in PayPal's pop-up (with a PayPal account, or by card as a guest).
//   3. The page asks the Worker to capture the payment (POST /api/order/pay), and the Worker marks
//      the Sanity order as paid and sends the emails.
//   4. PayPal also tells the Worker directly (webhook, POST /api/paypal/webhook), so an order still
//      gets marked paid if the customer closed the page at the wrong moment, and refunds made in
//      PayPal show up in the Studio.
//
// Settings: PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET and PAYPAL_WEBHOOK_ID (secrets), and PAYPAL_ENV
// ("sandbox" for testing with PayPal's pretend money, "live" for real payments) in wrangler.jsonc.

export interface PayPalEnv {
  PAYPAL_CLIENT_ID?: string;
  PAYPAL_CLIENT_SECRET?: string;
  PAYPAL_WEBHOOK_ID?: string;
  PAYPAL_ENV?: string;
}

export const paypalConfigured = (env: PayPalEnv) => Boolean(env.PAYPAL_CLIENT_ID && env.PAYPAL_CLIENT_SECRET);
export const paypalMode = (env: PayPalEnv): 'live' | 'sandbox' => (env.PAYPAL_ENV === 'live' ? 'live' : 'sandbox');
const base = (env: PayPalEnv) => (paypalMode(env) === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com');

// Access tokens last about 9 hours; keep one per Worker instance until shortly before it expires.
let cached: { key: string; token: string; expires: number } | undefined;

async function accessToken(env: PayPalEnv): Promise<string> {
  if (!paypalConfigured(env)) throw new Error('PAYPAL_CLIENT_ID is not set');
  const key = `${paypalMode(env)}:${env.PAYPAL_CLIENT_ID}`;
  if (cached && cached.key === key && cached.expires > Date.now()) return cached.token;
  const res = await fetch(`${base(env)}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) throw new Error(`PayPal auth failed: ${res.status} ${await res.text()}`);
  const out = (await res.json()) as { access_token: string; expires_in: number };
  cached = { key, token: out.access_token, expires: Date.now() + (out.expires_in - 300) * 1000 };
  return out.access_token;
}

export class PayPalError extends Error {
  constructor(public status: number, public body: any) {
    super(`PayPal request failed: ${status} ${JSON.stringify(body)}`);
  }
  /** PayPal's short error name, e.g. INSTRUMENT_DECLINED or ORDER_ALREADY_CAPTURED. */
  get issue(): string {
    return this.body?.details?.[0]?.issue ?? this.body?.name ?? '';
  }
}

async function call<T>(env: PayPalEnv, method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<T> {
  const res = await fetch(`${base(env)}${path}`, {
    method,
    headers: { Authorization: `Bearer ${await accessToken(env)}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data: any = text;
  try { data = text ? JSON.parse(text) : {}; } catch { /* leave as text */ }
  if (!res.ok) throw new PayPalError(res.status, data);
  return data as T;
}

const gbp = (n: number) => n.toFixed(2);

export interface NewPayPalOrder {
  /** Our Sanity order ID ("orders.<uuid>"), so a payment can always be matched to its order. */
  orderId: string;
  /** The AK-XXXXX reference staff and customers see. Shown in the charity's PayPal account too. */
  reference: string;
  description: string;
  brand: string;
  items: { name: string; quantity: number; price: number }[];
  total: number;
}

export interface PayPalOrder {
  id: string;
  status: string;
  purchase_units?: {
    custom_id?: string;
    invoice_id?: string;
    payments?: { captures?: Capture[] };
  }[];
}

export interface Capture {
  id: string;
  status: string;
  amount?: { currency_code: string; value: string };
  custom_id?: string;
  supplementary_data?: { related_ids?: { order_id?: string } };
}

export function createOrder(env: PayPalEnv, o: NewPayPalOrder) {
  return call<PayPalOrder>(env, 'POST', '/v2/checkout/orders', {
    intent: 'CAPTURE',
    purchase_units: [
      {
        reference_id: 'takeaway',
        custom_id: o.orderId,
        invoice_id: o.reference,
        description: o.description.slice(0, 127),
        amount: { currency_code: 'GBP', value: gbp(o.total), breakdown: { item_total: { currency_code: 'GBP', value: gbp(o.total) } } },
        items: o.items.map((i) => ({
          name: i.name.slice(0, 127),
          quantity: String(i.quantity),
          unit_amount: { currency_code: 'GBP', value: gbp(i.price) },
          category: 'PHYSICAL_GOODS',
        })),
      },
    ],
    // Food is collected or delivered by the charity, so PayPal shouldn't ask for a shipping address.
    application_context: { brand_name: o.brand.slice(0, 127), shipping_preference: 'NO_SHIPPING', user_action: 'PAY_NOW' },
  });
}

export const getOrder = (env: PayPalEnv, id: string) => call<PayPalOrder>(env, 'GET', `/v2/checkout/orders/${encodeURIComponent(id)}`);

/**
 * Takes the money for an approved PayPal order. Safe to call twice (from the page and the webhook):
 * the request ID makes PayPal treat repeats as the same capture, and an already-captured order
 * is looked up instead.
 */
export async function captureOrder(env: PayPalEnv, id: string): Promise<PayPalOrder> {
  try {
    return await call<PayPalOrder>(env, 'POST', `/v2/checkout/orders/${encodeURIComponent(id)}/capture`, {}, { 'PayPal-Request-Id': `capture-${id}` });
  } catch (err) {
    if (err instanceof PayPalError && err.issue === 'ORDER_ALREADY_CAPTURED') return getOrder(env, id);
    throw err;
  }
}

/** The completed capture in a PayPal order, if there is one. */
export const completedCapture = (order: PayPalOrder): Capture | undefined =>
  order.purchase_units?.[0]?.payments?.captures?.find((c) => c.status === 'COMPLETED');

/**
 * Checks a webhook really came from PayPal, by asking PayPal. The event is passed back exactly as
 * received (raw text), because re-encoding it can change it and make the check fail.
 */
export async function verifyWebhook(env: PayPalEnv, headers: Headers, rawBody: string): Promise<boolean> {
  if (!env.PAYPAL_WEBHOOK_ID || !paypalConfigured(env)) return false;
  const h = (name: string) => JSON.stringify(headers.get(name) ?? '');
  const body =
    `{"auth_algo":${h('paypal-auth-algo')},"cert_url":${h('paypal-cert-url')},"transmission_id":${h('paypal-transmission-id')},` +
    `"transmission_sig":${h('paypal-transmission-sig')},"transmission_time":${h('paypal-transmission-time')},` +
    `"webhook_id":${JSON.stringify(env.PAYPAL_WEBHOOK_ID)},"webhook_event":${rawBody}}`;
  const res = await fetch(`${base(env)}/v1/notifications/verify-webhook-signature`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await accessToken(env)}`, 'Content-Type': 'application/json' },
    body,
  });
  if (!res.ok) {
    console.error('PayPal webhook check failed', res.status, await res.text());
    return false;
  }
  return ((await res.json()) as { verification_status?: string }).verification_status === 'SUCCESS';
}
