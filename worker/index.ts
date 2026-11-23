// The small bit of server code behind the website. Everything else is static files.
//
//   GET  /api/order   whether orders are open right now, and the deadline
//   POST /api/order   place a takeaway order (checked here, saved in Sanity, emails sent)
//   daily cron        deletes old orders, so personal details aren't kept longer than needed
//
// Secrets (set in Cloudflare, never in this repo): SANITY_WRITE_TOKEN, TURNSTILE_SECRET_KEY,
// RESEND_API_KEY, and STAFF_EMAIL (who gets new-order alerts, comma-separated). Plain settings are in wrangler.jsonc under "vars".
import project from '../sanity.project.json';
import { formatDay, formatDeadline, isOpen, methodOf, money, schedule, type Method } from '../src/lib/ordering';
import { confirmationEmail, staffEmail, type PlacedOrder } from './emails';

export interface Env {
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

const API = `https://${project.projectId}.api.sanity.io/v2026-11-01/data`;

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/api/order' || url.pathname === '/api/order/') {
      try {
        if (request.method === 'GET') return await status(env);
        if (request.method === 'POST') return await placeOrder(request, env, ctx);
        return json({ ok: false, error: 'Method not allowed' }, 405);
      } catch (err) {
        console.error('Order error', err);
        // A short code (never secrets) so problems can be diagnosed from what the customer sees.
        const msg = String((err as Error)?.message ?? err);
        const code = msg.includes('is not set') ? 'setup' : (msg.match(/Sanity (query|mutation) failed: (\d+)/)?.slice(1).join('-') ?? 'unknown');
        return json({ ok: false, code, error: `Sorry, something went wrong on our side and your order wasn't sent (error: ${code}). Please try again, or contact us.` }, 500);
      }
    }
    return env.ASSETS.fetch(request);
  },

  async scheduled(_event, env, ctx) {
    ctx.waitUntil(deleteOldOrders(env));
  },
} satisfies ExportedHandler<Env>;

// ---- Sanity ---------------------------------------------------------------------------

async function sanityQuery<T>(env: Env, query: string, params: Record<string, unknown> = {}): Promise<T> {
  const qs = new URLSearchParams({ query, perspective: 'published' });
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
  site?: { name?: string; email?: string; phone?: string; address?: string };
}

const loadTakeaway = (env: Env) =>
  sanityQuery<Takeaway | null>(
    env,
    `*[_id == "takeaway"][0]{ takeawayDate, orderBefore, "menu": currentMenu->title, options[]{ _key, type, price, method },
      "site": *[_id == "siteSettings"][0]{ name, email, phone, address } }`,
  );

// ---- GET: are orders open? ------------------------------------------------------------

async function status(env: Env) {
  const t = await loadTakeaway(env);
  const s = schedule(t?.takeawayDate, t?.orderBefore);
  return json({ ok: true, open: isOpen(s), ...s, siteKey: env.TURNSTILE_SITE_KEY || TEST_SITE_KEY });
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

  if (Object.keys(errors).length) return json({ ok: false, error: Object.values(errors)[0], fields: errors }, 400);

  const totalMeals = items.reduce((n, i) => n + i.quantity, 0);
  const totalPrice = Math.round(items.reduce((n, i) => n + i.quantity * i.price, 0) * 100) / 100;
  const reference = makeReference();
  const submittedAt = new Date().toISOString();

  // IDs starting "orders." are private in Sanity: only signed-in staff can read them.
  await sanityMutate(env, [
    {
      create: {
        _id: `orders.${crypto.randomUUID()}`,
        _type: 'order',
        status: 'new',
        paid: false,
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

  const placed: PlacedOrder = {
    reference, name, phone, email, method, address, postcode, notes, totalMeals, totalPrice,
    items: items.map(({ option, quantity, price }) => ({ option, quantity, price })),
    menu: t?.menu ?? '',
    day: formatDay(s.takeawayDate),
    site: { name: t?.site?.name || "Ammi's Kitchen", email: t?.site?.email ?? '', phone: t?.site?.phone ?? '', address: t?.site?.address ?? '' },
    adminUrl: `${new URL(request.url).origin}/admin/structure/orders`,
  };
  // Send emails after replying, so the customer isn't kept waiting. A failed email never loses the order.
  ctx.waitUntil(sendEmails(env, placed));

  return json({ ok: true, reference, totalMeals, total: money(totalPrice), day: placed.day, emailed: Boolean(email && env.RESEND_API_KEY) });
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
  const staff = (env.STAFF_EMAIL ?? '').split(',').map((e) => e.trim()).filter(Boolean);
  const jobs: Promise<void>[] = [];
  if (order.email) jobs.push(sendEmail(env, { from, to: [order.email], reply_to: order.site.email || undefined, ...confirmationEmail(order) }));
  if (staff.length) jobs.push(sendEmail(env, { from, to: staff, reply_to: order.email || undefined, ...staffEmail(order) }));
  const results = await Promise.allSettled(jobs);
  for (const r of results) if (r.status === 'rejected') console.error(`Order ${order.reference}: email failed`, r.reason);
}

async function sendEmail(env: Env, message: Record<string, unknown>) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(message),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
}

// ---- Retention ------------------------------------------------------------------------

async function deleteOldOrders(env: Env) {
  if (!env.SANITY_WRITE_TOKEN) return;
  const days = Number(env.ORDER_RETENTION_DAYS) || 90;
  const before = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  // Includes unpublished staff edits (drafts.orders.*), which have the same type.
  await sanityMutate(env, [{ delete: { query: `*[_type == "order" && coalesce(takeawayDate, submittedAt) < "${before}"]` } }]);
  console.log(`Deleted orders for takeaways before ${before}`);
}

// ---- helpers --------------------------------------------------------------------------

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
