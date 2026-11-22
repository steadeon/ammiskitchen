# Ammi's Kitchen Sheffield website

A rebuild of ammiskitchensheffield.org as a static [Astro](https://astro.build) site.
It builds to plain HTML/CSS files that can be hosted anywhere (Netlify, Cloudflare Pages,
GitHub Pages, or any web server), with no database or CMS to maintain.

## Run it locally

Needs Node.js 20 or newer.

```sh
npm install
npm run dev       # live preview at http://localhost:4321
npm run build     # outputs the finished site to dist/
```

## Editing content

All text lives in small JSON files in `src/data/` — no code changes needed:

| What | File |
|---|---|
| Contact details, socials, allergy note, gift voucher, "about the food" text | `src/data/site.json` |
| **This fortnight's takeaway**: current menu, order deadline, featured chef, PayPal links and prices | `src/data/order.json` |
| Community lunch intro and dates | `src/data/community-lunch.json` |
| About page text and photo | `src/data/about.json` |
| FAQ questions | `src/data/faq.json` |
| Set meals (one file each; file name = page address `/menu/<name>`) | `src/data/menus/*.json` |

**Each fortnight:** add a new file in `src/data/menus/` (copy an existing one), then in
`order.json` set `currentMenu` to its file name (without `.json`), and update `orderBefore`
and `featuredChef`. Rebuild/redeploy.

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
