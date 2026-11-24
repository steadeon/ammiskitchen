// One-off import of the current website content (src/data/*.json) into Sanity.
//
// Only creates documents that don't exist yet, so it's safe to run again: it never
// overwrites anything staff have edited in the Studio.
//
//   SANITY_WRITE_TOKEN=<editor token> npm run seed
//
// (Also runs from GitHub Actions, see .github/workflows/seed-sanity.yml.)
import { readFile, readdir } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { createClient } from '@sanity/client';
import { htmlToBlocks, randomKey } from '@portabletext/block-tools';
import { compileSchema } from '@portabletext/schema';
import { JSDOM } from 'jsdom';

const root = new URL('../../', import.meta.url).pathname;
const project = JSON.parse(await readFile(join(root, 'sanity.project.json'), 'utf8'));
const token = process.env.SANITY_WRITE_TOKEN;
if (!token) {
  console.error('Set SANITY_WRITE_TOKEN to an Editor token from sanity.io/manage (API → Tokens).');
  process.exit(1);
}

const client = createClient({
  projectId: process.env.SANITY_STUDIO_PROJECT_ID || project.projectId,
  dataset: process.env.SANITY_STUDIO_DATASET || project.dataset,
  apiVersion: '2026-11-01',
  token,
  useCdn: false,
});

const data = async (p) => JSON.parse(await readFile(join(root, 'src/data', p), 'utf8'));
const key = () => randomKey(12);

// Same formatting options as the "richText" type in studio/schemas/richText.ts.
const ptSchema = compileSchema({
  styles: [{ name: 'normal' }],
  lists: [{ name: 'bullet' }, { name: 'number' }],
  decorators: [{ name: 'strong' }, { name: 'em' }],
  annotations: [{ name: 'link', fields: [{ name: 'href', type: 'string' }] }],
});
const blocks = (html) =>
  html ? htmlToBlocks(html, ptSchema, { parseHtml: (h) => new JSDOM(h).window.document, keyGenerator: key }) : undefined;

// Uploads a photo/PDF from a URL (old CMS) or a path under public/ (after download-images.mjs).
const uploaded = new Map();
async function upload(kind, src, extra = {}, typeName = kind) {
  if (!src) return undefined;
  if (!uploaded.has(src)) {
    try {
      const buf = src.startsWith('/')
        ? await readFile(join(root, 'public', src))
        : Buffer.from(await (await fetch(src).then((r) => (r.ok ? r : Promise.reject(new Error(`${r.status}`))))).arrayBuffer());
      const asset = await client.assets.upload(kind, buf, { filename: basename(src) });
      uploaded.set(src, asset._id);
      console.log(`  uploaded ${basename(src)}`);
    } catch (e) {
      console.warn(`  ! couldn't upload ${src}: ${e.message}`);
      uploaded.set(src, null);
    }
  }
  const id = uploaded.get(src);
  return id ? { _type: typeName, asset: { _type: 'reference', _ref: id }, ...extra } : undefined;
}
// Photo fields use the custom "photo" image type (studio/schemas/photo.ts).
const photo = (src, alt) => upload('image', src, alt ? { alt } : {}, 'photo');

let created = 0;
async function create(doc) {
  if (await client.getDocument(doc._id)) return console.log(`- ${doc._id} already exists, left alone`);
  const full = typeof doc.build === 'function' ? { _id: doc._id, _type: doc._type, ...(await doc.build()) } : doc;
  await client.createIfNotExists(full);
  created++;
  console.log(`+ ${doc._id}`);
}

// ---- import ---------------------------------------------------------------------------

const site = await data('site.json');
const order = await data('order.json');
const lunch = await data('community-lunch.json');
const about = await data('about.json');
const faq = await data('faq.json');

const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const chefId = `chef-${slugify(order.featuredChef.name)}`;

await create({
  _id: chefId,
  _type: 'chef',
  build: async () => ({
    name: order.featuredChef.name,
    description: order.featuredChef.description,
    photo: await photo(order.featuredChef.photo, order.featuredChef.name),
  }),
});

const menuDir = join(root, 'src/data/menus');
for (const file of (await readdir(menuDir)).filter((f) => f.endsWith('.json'))) {
  const slug = file.replace(/\.json$/, '');
  const m = JSON.parse(await readFile(join(menuDir, file), 'utf8'));
  await create({
    _id: `menu-${slug}`,
    _type: 'menu',
    build: async () => ({
      title: m.title,
      slug: { _type: 'slug', current: slug },
      legacyOrder: m.order ?? 0,
      image: await photo(m.image, m.imageAlt),
      items: m.items.map((i) => ({ _type: 'dish', _key: key(), name: i.name, description: i.description })),
      ingredients: blocks(m.ingredients),
      reheatingInstructions: await upload('file', m.reheatingInstructions),
    }),
  });
}

await create({
  _id: 'takeaway',
  _type: 'takeaway',
  build: async () => ({
    currentMenu: { _type: 'reference', _ref: `menu-${order.currentMenu}` },
    takeawayDate: order.takeawayDate,
    featuredChef: { _type: 'reference', _ref: chefId },
    options: order.options.map(({ _key, ...o }) => ({ _type: 'orderOption', _key: key(), ...o })),
  }),
});

await create({
  _id: 'communityLunch',
  _type: 'communityLunch',
  build: async () => ({
    tagline: lunch.tagline,
    introduction: blocks(lunch.introduction),
    datesHeading: lunch.datesHeading,
    dates: lunch.dates,
  }),
});

await create({
  _id: 'aboutPage',
  _type: 'aboutPage',
  build: async () => ({ text: blocks(about.text), image: await photo(about.image, about.imageAlt) }),
});

await create({
  _id: 'faqPage',
  _type: 'faqPage',
  build: async () => ({ items: faq.map((f) => ({ _type: 'faq', _key: key(), question: f.q, answer: blocks(f.a) })) }),
});

await create({
  _id: 'siteSettings',
  _type: 'siteSettings',
  build: async () => ({
    name: site.name,
    description: site.description,
    address: site.address,
    email: site.email,
    phone: site.phone,
    instagram: site.instagram,
    facebook: site.facebook,
    mailchimp: site.mailchimp,
    foodWarning: site.foodWarning,
    aboutFood: blocks(site.aboutFood),
    giftVoucher: {
      title: site.giftVoucher.title,
      text: site.giftVoucher.text,
      buttonText: site.giftVoucher.buttonText,
      url: site.giftVoucher.url,
      image: await photo(site.giftVoucher.image),
    },
  }),
});

console.log(`\nDone: ${created} document(s) created.`);
