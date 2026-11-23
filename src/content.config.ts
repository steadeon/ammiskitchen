import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';
import { readdir, readFile } from 'node:fs/promises';
import { fetchMenus, sanityEnabled } from './lib/cms';

const MENU_DIR = './src/data/menus';

// Reads src/data/menus/*.json (used when Sanity has no set meals yet).
async function jsonMenus() {
  const files = (await readdir(MENU_DIR)).filter((f) => f.endsWith('.json'));
  return Promise.all(files.map(async (f) => ({ id: f.replace(/\.json$/, ''), ...JSON.parse(await readFile(`${MENU_DIR}/${f}`, 'utf8')) })));
}

// Set meals. From Sanity when it's configured; otherwise one JSON file per meal in
// src/data/menus/ (the file name is the page URL, /menu/<file-name>).
const menus = defineCollection({
  loader: sanityEnabled
    ? async () => {
        const fromSanity = await fetchMenus();
        if (fromSanity.length) return fromSanity;
        console.warn('[cms] No set meals published in Sanity yet, using src/data/menus instead.');
        return jsonMenus();
      }
    : glob({ pattern: '*.json', base: MENU_DIR }),
  schema: z.object({
    title: z.string(),
    order: z.number().default(0),
    image: z.string(),
    imageAlt: z.string().default(''),
    items: z.array(z.object({ name: z.string(), description: z.string() })),
    ingredients: z.string().nullable().optional(),
    reheatingInstructions: z.string().optional(),
  }),
});

export const collections = { menus };
