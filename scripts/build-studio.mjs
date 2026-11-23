// Builds the Sanity Studio (the editing screens) into dist/admin, so staff can edit
// content at <website>/admin. Skipped when SANITY_DISABLED is set.
import { execSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';

if (process.env.SANITY_DISABLED) {
  console.log('[studio] SANITY_DISABLED is set, skipping the Studio build.');
  process.exit(0);
}

execSync('npm run build -w studio', { stdio: 'inherit' });

// The Studio is a single-page app: send every /admin/* address to its index page.
appendFileSync('dist/_redirects', '/admin/* /admin/index.html 200\n');
console.log('[studio] Built into dist/admin');
