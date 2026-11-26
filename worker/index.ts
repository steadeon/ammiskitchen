// The small bit of server code behind the website. Everything else is static files.
//
//   GET  /api/order   whether orders are open right now, and the deadline
//   POST /api/order   place a takeaway order (checked here, saved in Sanity, emails sent).
//                     With "Pay now", the order is saved unpaid and a PayPal payment is started instead.
//   POST /api/order/pay        take the PayPal payment once the customer approves it (see worker/paypal.ts)
//   POST /api/paypal/webhook   PayPal confirming payments and refunds directly
//   every 15 minutes  once orders close, emails staff a spreadsheet of the orders (see orderSheetEmail)
//   daily cron        deletes old orders, so personal details aren't kept longer than needed
//
// The order form is a beta feature (src/lib/features.ts): until "Online order form" is ticked in the
// Studio, orders are only accepted from people who turned it on for themselves at /beta, and the
// spreadsheet email is only sent if there are orders. "Pay online" is a second beta feature on top.
//
// Secrets (set in Cloudflare, never in this repo): SANITY_WRITE_TOKEN, TURNSTILE_SECRET_KEY,
// RESEND_API_KEY, STAFF_EMAIL (who gets new-order alerts, comma-separated), and for online payments
// PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET and PAYPAL_WEBHOOK_ID. Plain settings are in wrangler.jsonc under "vars".
import project from '../sanity.project.json';
import { formatDay, formatDeadline, isOpen, methodOf, money, schedule, type Method } from '../src/lib/ordering';
import { csvFilename, ORDERS_QUERY, ordersCsv, summarise, type SheetOrder } from '../src/lib/order-sheet';
import { betaFeatures } from '../src/lib/features';
import { confirmationEmail, orderSheetEmail, staffEmail, type PlacedOrder } from './emails';
import * as paypal from './paypal';

export interface Env extends paypal.PayPalEnv {
  ASSETS: Fetcher;
  SANITY_WRITE_TOKEN?: string;
  TURNSTILE_SECRET_KEY?: string;
  TURNSTILE_SITE_KEY?: string;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  STAFF_EMAIL?: string;
  ORDER_RETENTION_DAYS?: string;
}

// Cloudflare's published test keys: they always pass. Used until real keys are added.
const TEST_SITE_KEY = '1x00000000000000000000AA';
const TEST_SECRET_KEY = '1x0000000000000000000000000000000AA';

const DAILY_CRON = '0 4 * * *';

const API = `https://${project.projectId}.api.sanity.io/v2026-11-01/data`;

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, '');
    if (path === '/api/paypal/webhook') return paypalWebhook(request, env, ctx);
    if (path === '/api/order' || path === '/api/order/pay') {
      try {
        if (path === '/api/order/pay') return request.method === 'POST' ? await payOrder(request, env, ctx) : json({ ok: false, error: 'Method not allowed' }, 405);
        if (request.method === 'GET') return await status(request, env);
        if (request.method === 'POST') return await placeOrder(request, env, ctx);
        return json({ ok: false, error: 'Method not allowed' }, 405);
      } catch (err) {
        console.error('Order error', err);
        // A short code (never secrets) so problems can be diagnosed from what the customer sees.
        const msg = String((err as Error)?.message ?? err);
        const code = msg.includes('is not set') ? 'setup' : (msg.match(/(Sanity (?:query|mutation)|PayPal [a-z]+) failed: (\d+)/)?.slice(1).join('-').replace(/ /g, '-').toLowerCase() ?? 'unknown');
        return json({ ok: false, code, error: `Sorry, something went wrong on our side and your order wasn't sent (error: ${code}). Please try again, or contact us.` }, 500);
      }
    }
    return env.ASSETS.fetch(request);
  },

  async scheduled(event, env, ctx) {
    // The two schedules are in wrangler.jsonc ("triggers").
    ctx.waitUntil(event.cron === DAILY_CRON ? deleteOldOrders(env) : sendOrderSheetIfClosed(env));
  },
} satisfies ExportedHandler<Env>;

// ---- Sanity ---------------------------------------------------------------------------

async function sanityQuery<T>(env: Env, query: string, params: Record<string, unknown> = {}, perspective = 'published'): Promise<T> {
  const qs = new URLSearchParams({ query, perspective });
  for (const [k, v] of Object.entries(params)) qs.set(`$${k}`, JSON.stringify(v));
  const res = await fetch(`${API}/query/${project.dataset}?${qs}`, {
    headers: env.SANITY_WRITE_TOKEN ? { Authorization: `Bearer ${env.SANITY_WRITE_TOKEN}` } : {},
  });
  if (!res.ok) throw new Error(`Sanity query failed: ${res.status} ${await res.text()}`);
  return ((await res.json()) as { result: T }).result;
}

async function sanityMutate(env: Env, mutations: unknown[]) {
  if (!env.SANITY_WRITE_TOKEN) throw new Error('SANITY_WRITE_TOKEN is not set');
  const res = await fetch(`${API}/mutate/${project.dataset}?visibility=sync`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.SANITY_WRITE_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ mutations }),
  });
  if (!res.ok) throw new Error(`Sanity mutation failed: ${res.status} ${await res.text()}`);
  return res.json();
}

interface Takeaway {
  takeawayDate?: string;
  orderBefore?: string;
  menu?: string;
  options?: { _key: string; type: string; price: number; method?: string }[];
  site?: { name?: string; email?: string; phone?: string; address?: string; onlineOrdering?: boolean; onlinePayments?: boolean };
}

const loadTakeaway = (env: Env) =>
  sanityQuery<Takeaway | null>(
    env,
    `*[_id == "takeaway"][0]{ takeawayDate, orderBefore, "menu": currentMenu->title, options[]{ _key, type, price, method },
      "site": *[_id == "siteSettings"][0]{ name, email, phone, address, "onlineOrdering": features.onlineOrdering, "onlinePayments": features.onlinePayments } }`,
  );

// ---- GET: are orders open? ------------------------------------------------------------

/** "everyone" once switched on in the Studio; "beta" for someone who turned it on at /beta; otherwise "off". */
function onlineOrdering(t: Takeaway | null, request: Request): 'everyone' | 'beta' | 'off' {
  if (t?.site?.onlineOrdering) return 'everyone';
  return betaFeatures(request.headers.get('Cookie')).includes('ordering') ? 'beta' : 'off';
}

/** Whether this visitor is offered "Pay now": PayPal is set up, and the feature is on for everyone or for them. */
function onlinePayments(t: Takeaway | null, request: Request, env: Env): boolean {
  if (!paypal.paypalConfigured(env)) return false;
  return Boolean(t?.site?.onlinePayments) || betaFeatures(request.headers.get('Cookie')).includes('payments');
}

async function status(request: Request, env: Env) {
  const t = await loadTakeaway(env);
  const s = schedule(t?.takeawayDate, t?.orderBefore);
  // Which settings are present (true/false only, never their values), to help with setup.
  const configured = {
    sanityToken: Boolean(env.SANITY_WRITE_TOKEN),
    turnstile: Boolean(env.TURNSTILE_SITE_KEY && env.TURNSTILE_SECRET_KEY),
    resend: Boolean(env.RESEND_API_KEY),
    staffEmail: Boolean(env.STAFF_EMAIL),
    paypal: paypal.paypalConfigured(env) ? paypal.paypalMode(env) : false,
    paypalWebhook: Boolean(env.PAYPAL_WEBHOOK_ID),
  };
  // The PayPal client ID is public (it goes in PayPal's script on the page); the secret never leaves the Worker.
  const pay = onlinePayments(t, request, env) ? { clientId: env.PAYPAL_CLIENT_ID, mode: paypal.paypalMode(env) } : null;
  return json({ ok: true, open: isOpen(s), ...s, onlineOrdering: onlineOrdering(t, request), payOnline: pay, siteKey: env.TURNSTILE_SITE_KEY || TEST_SITE_KEY, configured });
}

// ---- POST: place an order -------------------------------------------------------------

type Fields = Record<string, string>;

async function placeOrder(request: Request, env: Env, ctx: ExecutionContext) {
  if (!sameOrigin(request)) return json({ ok: false, error: 'Please order from our website.' }, 403);

  let body: Fields;
  try {
    body = request.headers.get('content-type')?.includes('application/json')
      ? await request.json()
      : (Object.fromEntries(await request.formData()) as Fields);
  } catch {
    return json({ ok: false, error: "We couldn't read your order. Please try again." }, 400);
  }
  const str = (k: string, max: number) => String(body[k] ?? '').trim().slice(0, max);

  // Bots fill in the hidden "website" box; people never see it.
  if (str('website', 200)) return json({ ok: true, reference: 'AK-0000' });

  // Spam check (Cloudflare Turnstile).
  const human = await verifyTurnstile(str('cf-turnstile-response', 4096), request.headers.get('CF-Connecting-IP'), env);
  if (!human) return json({ ok: false, error: "We couldn't confirm you're not a robot. Please tick the check box again and resend." }, 403);

  const t = await loadTakeaway(env);
  if (onlineOrdering(t, request) === 'off') {
    return json({ ok: false, error: "Sorry, online ordering isn't open yet. Please order by email or PayPal, as shown on our Order page." }, 403);
  }
  const s = schedule(t?.takeawayDate, t?.orderBefore);
  if (!isOpen(s)) {
    const when = s.cutoff ? ` They closed on ${formatDeadline(s.cutoff)}.` : '';
    return json({ ok: false, closed: true, error: `Sorry, orders for this takeaway have closed.${when}` }, 409);
  }

  // Check every field. Prices come from Sanity, never from the browser.
  const errors: Record<string, string> = {};
  const name = str('name', 100);
  const phone = str('phone', 30);
  const email = str('email', 200).toLowerCase();
  const method = str('method', 20) as Method;
  const address = str('address', 400);
  const postcode = str('postcode', 10).toUpperCase().replace(/\s+/g, '').replace(/^(.+)(\d[A-Z]{2})$/, '$1 $2');
  const notes = str('notes', 1000);
  const payNow = str('payment', 20) === 'paypal';

  if (!name) errors.name = 'Please tell us your name.';
  if (!/^[0-9+()\-\s]{7,30}$/.test(phone) || (phone.match(/\d/g)?.length ?? 0) < 7) errors.phone = 'Please give a phone number we can call.';
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = "That email address doesn't look right.";
  if (method !== 'collection' && method !== 'delivery') errors.method = 'Please choose collection or delivery.';
  if (method === 'delivery') {
    if (!address) errors.address = 'Please give the delivery address.';
    if (!/^[A-Z]{1,2}\d[A-Z\d]? \d[A-Z]{2}$/.test(postcode)) errors.postcode = 'Please give a full postcode, like S7 1FB.';
  }

  const options = (t?.options ?? []).filter((o) => methodOf(o) === method);
  const items = options
    .map((o) => ({ _key: o._key, _type: 'orderItem', option: o.type, price: Number(o.price) || 0, quantity: Number(body[`qty-${o._key}`] ?? 0) }))
    .filter((i) => i.quantity !== 0);
  if (items.some((i) => !Number.isInteger(i.quantity) || i.quantity < 0 || i.quantity > 50)) errors.items = 'Please choose between 0 and 50 of each meal.';
  else if (!items.length) errors.items = 'Please choose how many meals you would like.';

  if (payNow && !onlinePayments(t, request, env)) errors.payment = "Sorry, paying online isn't available at the moment. Please choose to pay when you collect or we deliver.";

  if (Object.keys(errors).length) return json({ ok: false, error: Object.values(errors)[0], fields: errors }, 400);

  const totalMeals = items.reduce((n, i) => n + i.quantity, 0);
  const totalPrice = Math.round(items.reduce((n, i) => n + i.quantity * i.price, 0) * 100) / 100;
  const reference = makeReference();
  const submittedAt = new Date().toISOString();
  const orderId = `orders.${crypto.randomUUID()}`;

  // IDs starting "orders." are private in Sanity: only signed-in staff can read them.
  // A "Pay now" order waits as "awaitingPayment" (not counted anywhere) until PayPal confirms the money.
  await sanityMutate(env, [
    {
      create: {
        _id: orderId,
        _type: 'order',
        status: payNow ? 'awaitingPayment' : 'new',
        paid: false,
        payment: payNow ? 'paypal' : 'later',
        reference,
        takeawayDate: s.takeawayDate,
        menu: t?.menu ?? '',
        method,
        items,
        totalMeals,
        totalPrice,
        notes,
        name,
        phone,
        email,
        ...(method === 'delivery' ? { address, postcode } : {}),
        submittedAt,
      },
    },
  ]);

  const placed = placedOrder({ reference, name, phone, email, method, address, postcode, notes, totalMeals, totalPrice, items, paid: false }, t, s.takeawayDate, request);

  if (payNow) {
    // Start the PayPal payment. Emails wait until the money has arrived (see finishPayment).
    try {
      const pp = await paypal.createOrder(env, {
        orderId,
        reference,
        description: `${placed.site.name} takeaway for ${placed.day} (${reference})`,
        brand: placed.site.name,
        items: placed.items.map((i) => ({ name: i.option, quantity: i.quantity, price: i.price })),
        total: totalPrice,
      });
      await sanityMutate(env, [{ patch: { id: orderId, set: { paypalOrderId: pp.id } } }]);
      return json({ ok: true, reference, paypalOrderId: pp.id });
    } catch (err) {
      console.error(`Order ${reference}: couldn't start PayPal payment`, err);
      await sanityMutate(env, [{ delete: { id: orderId } }]).catch(() => {});
      return json({ ok: false, error: "Sorry, we couldn't start the online payment. Please try again, or choose to pay when you collect or we deliver." }, 502);
    }
  }

  // Send emails after replying, so the customer isn't kept waiting. A failed email never loses the order.
  ctx.waitUntil(sendEmails(env, placed));

  return json({ ok: true, reference, totalMeals, total: money(totalPrice), day: placed.day, emailed: Boolean(email && env.RESEND_API_KEY) });
}

interface OrderFacts {
  reference: string; name: string; phone: string; email: string; method: Method; address?: string; postcode?: string; notes?: string;
  totalMeals: number; totalPrice: number; items: { option: string; quantity: number; price: number }[]; paid: boolean;
}

/** Everything the emails need about an order. */
function placedOrder(o: OrderFacts, t: Takeaway | null, takeawayDate: string, request: Request, menu = t?.menu ?? ''): PlacedOrder {
  return {
    reference: o.reference, name: o.name, phone: o.phone, email: o.email ?? '', method: o.method, address: o.address ?? '', postcode: o.postcode ?? '',
    notes: o.notes ?? '', totalMeals: o.totalMeals, totalPrice: o.totalPrice, paidOnline: o.paid,
    items: o.items.map(({ option, quantity, price }) => ({ option, quantity, price })),
    menu,
    day: formatDay(takeawayDate),
    site: { name: t?.site?.name || "Ammi's Kitchen", email: t?.site?.email ?? '', phone: t?.site?.phone ?? '', address: t?.site?.address ?? '' },
    adminUrl: `${new URL(request.url).origin}/admin/structure/orders`,
  };
}

// ---- Online payment (PayPal) ------------------------------------------------------------

interface StoredOrder extends OrderFacts {
  _id: string;
  _rev: string;
  status?: string;
  takeawayDate: string;
  menu?: string;
  paypalOrderId?: string;
}

const STORED_ORDER = `{ _id, _rev, status, paid, reference, name, phone, email, method, address, postcode, notes, totalMeals, totalPrice,
  items[]{ option, quantity, price }, takeawayDate, menu, paypalOrderId }`;

const findByPayPalId = (env: Env, paypalOrderId: string) =>
  sanityQuery<StoredOrder | null>(env, `*[_type == "order" && paypalOrderId == $id && !(_id in path("drafts.**"))][0]${STORED_ORDER}`, { id: paypalOrderId }, 'raw');

/** POST /api/order/pay: the customer approved the payment in PayPal's pop-up, so take the money. */
async function payOrder(request: Request, env: Env, ctx: ExecutionContext) {
  if (!sameOrigin(request)) return json({ ok: false, error: 'Please order from our website.' }, 403);
  const body = (await request.json().catch(() => ({}))) as { paypalOrderId?: string };
  const id = String(body.paypalOrderId ?? '').slice(0, 64);
  const order = id && /^[A-Z0-9-]+$/i.test(id) ? await findByPayPalId(env, id) : null;
  if (!order) return json({ ok: false, error: "We couldn't find that order. Please try again, or contact us." }, 404);

  let pp: paypal.PayPalOrder;
  try {
    pp = await paypal.captureOrder(env, id);
  } catch (err) {
    // The card was refused: PayPal's pop-up can offer the customer another way to pay.
    if (err instanceof paypal.PayPalError && err.issue === 'INSTRUMENT_DECLINED') return json({ ok: false, retry: true, error: 'Your payment was declined. Please try another card or payment method.' }, 402);
    throw err;
  }
  const capture = paypal.completedCapture(pp);
  if (!capture) {
    // Rare: PayPal is still checking the payment (status PENDING). The webhook will finish it.
    return json({ ok: false, pending: true, reference: order.reference, error: `Thank you. PayPal is still processing your payment. We'll email you once it's confirmed. Your order number is ${order.reference}.` }, 202);
  }
  const done = await finishPayment(env, order, capture, request, ctx);
  return json({ ok: true, paid: done.paid, reference: order.reference, totalMeals: order.totalMeals, total: money(order.totalPrice), day: formatDay(order.takeawayDate), emailed: Boolean(order.email && env.RESEND_API_KEY) });
}

/**
 * Marks an order paid once PayPal has the money, then sends the emails. Runs from the page and from
 * the webhook; whichever gets there first does it (Sanity's revision check stops it happening twice).
 */
async function finishPayment(env: Env, order: StoredOrder, capture: paypal.Capture, request: Request, ctx: ExecutionContext) {
  if (order.paid) return { paid: true, first: false };
  const amount = Number(capture.amount?.value ?? 0);
  const enough = capture.amount?.currency_code === 'GBP' && amount + 0.001 >= order.totalPrice;
  const set: Record<string, unknown> = { paypalCaptureId: capture.id, paidAmount: amount, paidAt: new Date().toISOString() };
  if (enough) set.paid = true;
  else set.staffNotes = `PayPal payment of ${capture.amount?.currency_code} ${capture.amount?.value} doesn't match the order total of ${money(order.totalPrice)}. Please check in PayPal.`;
  if (order.status === 'awaitingPayment') set.status = 'new';
  try {
    await sanityMutate(env, [{ patch: { id: order._id, ifRevisionID: order._rev, set } }]);
  } catch (err) {
    // Someone else (the webhook, or the page) changed it first: check whether it's now paid.
    if (!String((err as Error).message).includes('409')) throw err;
    const now = await sanityQuery<{ paid?: boolean } | null>(env, `*[_id == $id][0]{ paid }`, { id: order._id }, 'raw');
    return { paid: Boolean(now?.paid), first: false };
  }
  const t = await loadTakeaway(env);
  ctx.waitUntil(sendEmails(env, placedOrder({ ...order, paid: enough }, t, order.takeawayDate, request, order.menu)));
  console.log(`Order ${order.reference}: paid ${amount} by PayPal (capture ${capture.id})`);
  return { paid: enough, first: true };
}

/** POST /api/paypal/webhook: PayPal telling us about payments directly (set up in the PayPal developer dashboard). */
async function paypalWebhook(request: Request, env: Env, ctx: ExecutionContext) {
  if (request.method !== 'POST') return json({ ok: false }, 405);
  const raw = await request.text();
  if (!(await paypal.verifyWebhook(env, request.headers, raw).catch(() => false))) return json({ ok: false }, 401);
  const event = JSON.parse(raw) as { event_type: string; resource: any };
  try {
    switch (event.event_type) {
      // The customer approved but the page never asked us to take the money (e.g. they closed it).
      case 'CHECKOUT.ORDER.APPROVED': {
        const order = await findByPayPalId(env, event.resource.id);
        if (!order || order.paid) break;
        const capture = paypal.completedCapture(await paypal.captureOrder(env, event.resource.id));
        if (capture) await finishPayment(env, order, capture, request, ctx);
        break;
      }
      case 'PAYMENT.CAPTURE.COMPLETED': {
        const id = event.resource.supplementary_data?.related_ids?.order_id;
        const order = id ? await findByPayPalId(env, id) : null;
        if (order) await finishPayment(env, order, event.resource, request, ctx);
        break;
      }
      // A payment PayPal was still checking (pending) was refused in the end: note it for staff.
      case 'PAYMENT.CAPTURE.DENIED': {
        const id = event.resource.supplementary_data?.related_ids?.order_id;
        const order = id ? await findByPayPalId(env, id) : null;
        if (order && !order.paid) await sanityMutate(env, [{ patch: { id: order._id, set: { staffNotes: `PayPal refused this payment (transaction ${event.resource.id}). The customer hasn't paid.` } } }]);
        break;
      }
      // Refunded in the charity's PayPal account: show it in the Studio.
      case 'PAYMENT.CAPTURE.REFUNDED': {
        const captureId = event.resource.links?.find((l: { rel: string; href: string }) => l.rel === 'up')?.href?.split('/').pop();
        const ids = captureId ? await sanityQuery<string[]>(env, `*[_type == "order" && paypalCaptureId == $id]._id`, { id: captureId }, 'raw') : [];
        if (ids.length) await sanityMutate(env, ids.map((id) => ({ patch: { id, set: { paid: false, refundedAt: new Date().toISOString() } } })));
        break;
      }
    }
  } catch (err) {
    console.error(`PayPal webhook ${event.event_type} failed`, err);
    // Non-2xx makes PayPal try again later.
    return json({ ok: false }, 500);
  }
  return json({ ok: true });
}

function sameOrigin(request: Request) {
  const origin = request.headers.get('Origin');
  return !origin || origin === new URL(request.url).origin;
}

async function verifyTurnstile(token: string, ip: string | null, env: Env) {
  if (!token) return false;
  const form = new FormData();
  form.append('secret', env.TURNSTILE_SECRET_KEY || TEST_SECRET_KEY);
  form.append('response', token);
  if (ip) form.append('remoteip', ip);
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form });
  const out = (await res.json()) as { success: boolean };
  return out.success;
}

// Short, easy to read out over the phone (no 0/O or 1/I).
function makeReference() {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const bytes = crypto.getRandomValues(new Uint8Array(5));
  return 'AK-' + Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

// ---- Emails (Resend) ------------------------------------------------------------------

async function sendEmails(env: Env, order: PlacedOrder) {
  if (!env.RESEND_API_KEY) {
    console.log(`Order ${order.reference} saved. Emails skipped: RESEND_API_KEY is not set.`);
    return;
  }
  const from = env.EMAIL_FROM || "Ammi's Kitchen <onboarding@resend.dev>";
  const staff = staffEmails(env);
  const jobs: Promise<void>[] = [];
  if (order.email) jobs.push(sendEmail(env, { from, to: [order.email], reply_to: order.site.email || undefined, ...confirmationEmail(order) }));
  if (staff.length) jobs.push(sendEmail(env, { from, to: staff, reply_to: order.email || undefined, ...staffEmail(order) }));
  const results = await Promise.allSettled(jobs);
  for (const r of results) if (r.status === 'rejected') console.error(`Order ${order.reference}: email failed`, r.reason);
}

const staffEmails = (env: Env) => (env.STAFF_EMAIL ?? '').split(',').map((e) => e.trim()).filter(Boolean);

async function sendEmail(env: Env, message: Record<string, unknown>) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(message),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
}

// ---- Order spreadsheet at the deadline --------------------------------------------------

// A private note in Sanity of which deadline the spreadsheet was last emailed for, so it's sent
// once per takeaway (and again if staff move the deadline later). Not an order, so never deleted.
const SENT_LOG_ID = 'orders.sheet-email-log';
// Don't send for a deadline that passed longer ago than this (e.g. the first time this runs).
const SEND_WITHIN_MS = 2 * 86400000;

export async function sendOrderSheetIfClosed(env: Env, now = new Date()) {
  if (!env.SANITY_WRITE_TOKEN || !env.RESEND_API_KEY || !staffEmails(env).length) return;
  const r = await sanityQuery<{
    takeaway: { takeawayDate?: string; orderBefore?: string } | null;
    sent: string | null;
    site: string | null;
    forEveryone: boolean | null;
  }>(
    env,
    `{ "takeaway": *[_id == "takeaway"][0]{ takeawayDate, orderBefore }, "sent": *[_id == $log][0].sentFor,
       "site": *[_id == "siteSettings"][0].name, "forEveryone": *[_id == "siteSettings"][0].features.onlineOrdering }`,
    { log: SENT_LOG_ID },
  );
  const s = schedule(r.takeaway?.takeawayDate, r.takeaway?.orderBefore);
  if (!s.cutoff || !s.takeawayDate) return;
  const age = now.getTime() - new Date(s.cutoff).getTime();
  const key = `${s.takeawayDate} ${s.cutoff}`;
  if (age < 0 || age > SEND_WITHIN_MS || r.sent === key) return;

  // "drafts" so staff edits (e.g. a cancellation) count even if not yet published.
  const orders = await sanityQuery<SheetOrder[]>(env, ORDERS_QUERY, { date: s.takeawayDate }, 'drafts');
  // While the order form is still in beta, don't email staff an empty spreadsheet every fortnight.
  if (!r.forEveryone && !orders.length) return;
  const message = orderSheetEmail({
    day: formatDay(s.takeawayDate),
    deadline: formatDeadline(s.cutoff),
    summary: summarise(orders),
    siteName: r.site || "Ammi's Kitchen",
  });
  await sendEmail(env, {
    from: env.EMAIL_FROM || "Ammi's Kitchen <onboarding@resend.dev>",
    to: staffEmails(env),
    ...message,
    attachments: [{ filename: csvFilename(s.takeawayDate), content: toBase64(ordersCsv(orders, s.takeawayDate)) }],
  });
  await sanityMutate(env, [{ createOrReplace: { _id: SENT_LOG_ID, _type: 'sheetEmailLog', sentFor: key, sentAt: now.toISOString() } }]);
  console.log(`Order spreadsheet for ${s.takeawayDate} emailed to staff (${orders.length} orders)`);
}

const toBase64 = (text: string) => {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};

// ---- Retention ------------------------------------------------------------------------

async function deleteOldOrders(env: Env) {
  if (!env.SANITY_WRITE_TOKEN) return;
  const days = Number(env.ORDER_RETENTION_DAYS) || 90;
  const before = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  // Includes unpublished staff edits (drafts.orders.*), which have the same type.
  await sanityMutate(env, [{ delete: { query: `*[_type == "order" && coalesce(takeawayDate, submittedAt) < "${before}"]` } }]);
  // "Pay now" orders where the customer never finished paying (they're not counted anywhere).
  const abandoned = new Date(Date.now() - 2 * 86400000).toISOString();
  await sanityMutate(env, [{ delete: { query: `*[_type == "order" && status == "awaitingPayment" && submittedAt < "${abandoned}"]` } }]);
  console.log(`Deleted orders for takeaways before ${before}, and unfinished online payments`);
}

// ---- helpers --------------------------------------------------------------------------

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
