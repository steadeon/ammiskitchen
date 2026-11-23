# Ammi's Kitchen Sheffield website

A rebuild of ammiskitchensheffield.org as a static [Astro](https://astro.build) site.
It builds to plain HTML/CSS files that can be hosted anywhere (Netlify, Cloudflare Pages,
GitHub Pages, or any web server). Content is edited in [Sanity](https://www.sanity.io)
(a hosted headless CMS, free plan) and pulled in when the site is built.

## Run it locally

Needs Node.js 22.12 or newer.

```sh
npm install
npm run dev       # live preview at http://localhost:4321
npm run build     # outputs the finished site to dist/
```

## Editing content (Sanity CMS)

Staff edit the website in **Sanity Studio** at **`<website>/admin`** (for example
`https://ammiskitchensheffield.org/admin`), signing in with their Sanity account.
Nothing to install.

| In the Studio | What it changes |
|---|---|
| **Takeaway orders** | Orders placed on the website: *This takeaway*, *Upcoming*, *All orders* |
| **This fortnight's takeaway** | Current menu, takeaway Friday (sets the order deadline), "Meet the chef", meal options and prices |
| **Set meals** | One per menu: photo, dishes, ingredients, reheating PDF. Each gets a page at `/menu/<page address>` |
| **Chefs** | Name, photo and bio, picked for "Meet the chef" |
| **Community lunch page** | Intro text and lunch dates (past dates hide themselves) |
| **About page** / **FAQs** | Text and photo / questions (drag to reorder) |
| **Contact details & shared text** | Address, email, phone, socials, allergy warning, gift voucher, "about the food" |

**Each fortnight:** add a new set meal (or reuse one), then open *This fortnight's takeaway*,
pick it as the current menu, set the takeaway Friday and chef, and press **Publish**. The site
rebuilds by itself and is live about two minutes later.

### How it fits together

```
Staff ──edit──▶ Sanity Studio (/admin) ──publish──▶ Sanity content store (free plan)
                                                        │ webhook
                                                        ▼
GitHub (code) ──push──▶ Cloudflare build: Astro fetches content from Sanity
                        and outputs plain HTML ──▶ visitors
```

- The Sanity project is set in `sanity.project.json` (project ID isn't secret).
- Content types (the editing forms) are in `studio/schemas/`; the Studio menu is `studio/structure.ts`.
- The site reads content in `src/lib/cms.ts` (and set meals in `src/content.config.ts`).
- `npm run build` builds the site **and** the Studio into `dist/admin`.
- `src/data/*.json` is the fallback: used for anything not yet published in Sanity, or locally when
  Sanity can't be reached. Set `SANITY_DISABLED=1` to ignore Sanity entirely. On Cloudflare a Sanity
  error stops the build instead, so the live site never quietly reverts to old content.

### One-time setup

1. **Sanity → CORS origins** (sanity.io/manage → project → API → CORS origins): add each address the
   Studio is opened from, ticking *Allow credentials*: `http://localhost:3333`, `http://localhost:4321`,
   `https://*.paul-848.workers.dev` (Cloudflare previews), and the real domain.
2. **Import existing content:** create an *Editor* token (API → Tokens), save it as the GitHub repository
   secret `SANITY_WRITE_TOKEN`, then run the *Import content into Sanity* workflow (Actions tab).
   Or locally: `SANITY_WRITE_TOKEN=… npm run seed`. It only creates what's missing.
3. **Rebuild on publish:** in Cloudflare → Workers & Pages → *ammiskitchen* → Settings → Builds → *Deploy hooks*, create a hook for the
   branch to rebuild (`main` for the live site) and copy its URL. In Sanity → API → *Webhooks*, add a
   webhook: URL = that hook, dataset `production`, trigger on create/update/delete, method POST, and
   filter `!(_id in path("drafts.**"))` so only published changes trigger builds.
4. **Invite staff** in Sanity → Members (the free plan includes up to 20 users).

### Local development

```sh
npm install
npm run dev       # website at http://localhost:4321 (uses published Sanity content)
npm run studio    # Studio at http://localhost:3333/admin
```

## Takeaway ordering

Customers order on the **Order Takeaway** page with a simple form: no account, they type their
name, phone, optional email, collection or delivery (with address), how many of each meal, and notes.
They pay by cash or card on collection or delivery.

- **Deadline:** orders close at **5pm (UK time) on the Tuesday before** the *Takeaway Friday* set in Sanity.
  Fill in *Custom order deadline* to use a different time for one week. The form switches to
  "orders closed" by itself, and the server refuses late orders too. The rule lives in `src/lib/ordering.ts`.
- **Where orders go:** `worker/index.ts` (a small Cloudflare Worker at `/api/order`) checks the order,
  takes prices from Sanity (never from the browser), and saves it as an **Order** in Sanity, which staff
  see under *Takeaway orders* in /admin. Staff can tick *Paid*, set a status and add staff notes.
- **Emails** (via [Resend](https://resend.com), free up to 3,000 a month): a confirmation to the customer
  if they gave an email, and an alert to `STAFF_EMAIL`. A failed email never loses an order.
- **Spam:** [Cloudflare Turnstile](https://www.cloudflare.com/products/turnstile/) (free, usually invisible),
  plus a hidden "honeypot" box and a same-site check.
- **Privacy:** order IDs start with `orders.`, which Sanity keeps private even though the rest of the
  content is public: only signed-in staff can read them. A daily job deletes orders 90 days after their
  takeaway (`ORDER_RETENTION_DAYS` in `wrangler.jsonc`). The form has a short privacy note.

### Settings (Cloudflare → Workers & Pages → ammiskitchen → Settings → Build)

The secrets live in the **build** settings and are passed to the running Worker at deploy time
(`scripts/worker-secrets.mjs` writes them to a git-ignored `.worker-secrets.json`). Add each under
*Variables and secrets* as type **Secret**, on both the **Production** and **Previews Base** tabs:

| Name | What |
|---|---|
| `SANITY_WRITE_TOKEN` | Sanity token with *Editor* rights (sanity.io/manage → API → Tokens) |
| `TURNSTILE_SITE_KEY` | Turnstile site key (public, but kept here with its partner) |
| `TURNSTILE_SECRET_KEY` | Turnstile secret key |
| `RESEND_API_KEY` | Resend API key (*Sending access*) |
| `STAFF_EMAIL` | Who gets new-order alerts, comma-separated |

Commands (same screen, *Build configuration*):

- Previews Base tab, *Preview command*: `npx wrangler preview --secrets-file .worker-secrets.json`
- Production tab, *Deploy command*: `npx wrangler deploy --secrets-file .worker-secrets.json`
  (change this one when the ordering code is merged into `main`; until then keep `npx wrangler deploy`)

(Cloudflare's *Runtime variables and secrets* screen only unlocks once `main` has the Worker script.)

Without the Turnstile keys the form uses Cloudflare's test keys (always passes). Without
`RESEND_API_KEY` orders are saved but no emails are sent. While `EMAIL_FROM` in `wrangler.jsonc` is
empty, emails use Resend's test sender, which only delivers to the Resend account's own address (fine for
testing). **At go-live:** verify ammiskitchensheffield.org in Resend (Domains → Add domain, then add its DNS
records), set `EMAIL_FROM` to `Ammi's Kitchen <orders@ammiskitchensheffield.org>`, and add the Turnstile keys.

**Important:** the Sanity webhook that rebuilds the site must ignore orders, or every order triggers a
rebuild. Its filter should be: `!(_id in path("drafts.**")) && _type != "order"`.

## Brand and animation

- Colours are in `src/styles/global.css` (taken from the original stylesheet).
- The animated logo is the original Lottie file: `public/lottie/logo.json`.
- Background shapes and sunbursts are the original SVGs in `src/assets/svg/`.
- Page-to-page slide transitions use Astro view transitions (`src/layouts/Base.astro`).
- Elements with `data-reveal` fade up as they scroll into view.
- All motion is switched off for visitors who set "reduce motion" on their device.

## Before going live

1. Run `node scripts/download-images.mjs` to copy photos and PDFs off the old CMS
   (the site currently loads them from `cms.ammiskitchensheffield.org`, which will go away).
2. Swap in the official assets from the previous developer when they arrive.
3. Set `site` in `astro.config.mjs` to the real domain.
