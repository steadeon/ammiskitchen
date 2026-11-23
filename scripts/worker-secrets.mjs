// Copies the order form's secrets from Cloudflare's build variables into .worker-secrets.json,
// so the deploy command can hand them to the running Worker:
//   npx wrangler preview --secrets-file .worker-secrets.json           (branch previews)
//   npx wrangler deploy --secrets-file .worker-secrets.json            (main)
// Set them in Cloudflare → ammiskitchen → Settings → Build → Variables and secrets.
// Only names listed here are copied, and only when set. The file is git-ignored.
import { writeFileSync } from 'node:fs';

const names = ['SANITY_WRITE_TOKEN', 'RESEND_API_KEY', 'STAFF_EMAIL', 'TURNSTILE_SITE_KEY', 'TURNSTILE_SECRET_KEY'];
const secrets = Object.fromEntries(names.filter((n) => process.env[n]).map((n) => [n, process.env[n]]));
writeFileSync('.worker-secrets.json', JSON.stringify(secrets));
console.log(`[secrets] Prepared for the Worker: ${Object.keys(secrets).join(', ') || 'none'}`);
