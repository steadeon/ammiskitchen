// Builds the Sanity Studio (the editing screens) into dist/admin, so staff can edit
// content at <website>/admin. Skipped when SANITY_DISABLED is set.
import { execSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';

if (process.env.SANITY_DISABLED) {
  console.log('[studio] SANITY_DISABLED is set, skipping the Studio build.');
  process.exit(0);
}

execSync('npm run build -w studio', { stdio: 'inherit' });

// The Studio is a single-page app, so deep links like /admin/structure/menu must load its
// index page. One rule per Studio tool, because a catch-all /admin/* rule would also match
// /admin/ itself, which Cloudflare rejects as an infinite loop.
const tools = ['structure', 'vision', 'intent'];
appendFileSync('dist/_redirects', tools.map((t) => `/admin/${t}/* /admin/ 200\n`).join(''));
console.log('[studio] Built into dist/admin');
