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
| **This fortnight's takeaway** | Current menu, order deadline, "Meet the chef", PayPal options and prices |
| **Set meals** | One per menu: photo, dishes, ingredients, reheating PDF. Each gets a page at `/menu/<page address>` |
| **Chefs** | Name, photo and bio, picked for "Meet the chef" |
| **Community lunch page** | Intro text and lunch dates (past dates hide themselves) |
| **About page** / **FAQs** | Text and photo / questions (drag to reorder) |
| **Contact details & shared text** | Address, email, phone, socials, allergy warning, gift voucher, "about the food" |

**Each fortnight:** add a new set meal (or reuse one), then open *This fortnight's takeaway*,
pick it as the current menu, set the deadline and chef, and press **Publish**. The site
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
