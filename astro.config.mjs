import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import react from '@astrojs/react';
import keystatic from '@keystatic/astro';

// `npm run dev` runs in plain Node so Keystatic can save straight to the files on this
// computer. Builds use the Cloudflare adapter.
const isDev = process.argv.includes('dev');

export default defineConfig({
  // TODO: confirm the final domain before launch.
  site: 'https://ammiskitchensheffield.org',
  // Every public page is still built to plain HTML. Only the editor (/keystatic and
  // /api/keystatic) runs on demand, as a small Cloudflare Worker.
  output: 'static',
  adapter: isDev ? undefined : cloudflare({ prerenderEnvironment: 'node', imageService: 'passthrough' }),
  session: false,
  integrations: [react(), keystatic()],
  redirects: { '/admin': '/keystatic' },
});
