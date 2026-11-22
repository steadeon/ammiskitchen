import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// One JSON file per set meal in src/data/menus/. The file name is the page URL (/menu/<file-name>).
const menus = defineCollection({
  loader: glob({ pattern: '*.json', base: './src/data/menus' }),
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
