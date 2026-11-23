# Ammi's Kitchen Sheffield website

A rebuild of ammiskitchensheffield.org as a static [Astro](https://astro.build) site.
Every public page builds to plain HTML/CSS. The only server code is the small content editor at
`/admin`, which runs as a Cloudflare Worker. There is no database: content lives in this repo.

## Run it locally

Needs Node.js 22 or newer.

```sh
npm install
npm run dev       # live preview at http://localhost:4321
npm run build     # outputs the finished site to dist/
```

## Editing content

Staff edit the site at **/admin** (for example `https://ammiskitchensheffield.org/admin`) using
simple forms powered by [Keystatic](https://keystatic.com). Saving a form commits the change to
GitHub, and Cloudflare rebuilds and publishes the site a minute or two later. No code involved.

| Editor section | What it controls | File(s) |
|---|---|---|
| This fortnight's takeaway | Menu on sale, order deadline, featured chef, PayPal options | `src/content/order/` |
| Set meals | One entry per menu (dishes, photo, ingredients, reheating PDF) | `src/content/menus/*.mdoc` |
| Chefs | Name, photo and blurb for "Meet the chef" | `src/content/chefs/*.json` |
| About page / Community lunch page | Page text, photo, lunch dates | `src/content/about/`, `src/content/community-lunch/` |
| FAQs | One entry per question | `src/content/faqs/*.mdoc` |
| Contact details & shared text | Address, socials, allergy note, gift voucher, "about the food" | `src/content/settings/` |

**Each fortnight:** add the new menu under *Set meals*, then in *This fortnight's takeaway* pick
it as "Menu on sale now" and update the deadline and chef.

Running `npm run dev` and opening http://127.0.0.1:4321/admin edits the files on your own
computer instead. See [docs/content-editing.md](docs/content-editing.md) for how sign-in and
hosting are set up.

## Brand and animation

- Colours are in `src/styles/global.css` (taken from the original stylesheet).
- The animated logo is the original Lottie file: `public/lottie/logo.json`.
- Background shapes and sunbursts are the original SVGs in `src/assets/svg/`.
- Page-to-page slide transitions use Astro view transitions (`src/layouts/Base.astro`).
- Elements with `data-reveal` fade up as they scroll into view.
- All motion is switched off for visitors who set "reduce motion" on their device.

## Before going live

1. Copy photos and PDFs off the old CMS into `public/media/` (the site still loads them from
   `cms.ammiskitchensheffield.org`, which will go away), then point each entry at its local copy
   and remove the "link (old website)" fields from `keystatic.config.tsx`.
2. Swap in the official assets from the previous developer when they arrive.
3. Set `site` in `astro.config.mjs` to the real domain.
