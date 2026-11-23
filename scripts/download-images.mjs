// Copies every photo/PDF the site still loads from the old CMS into public/media/, then moves
// each link from its "link (old website)" field into the matching upload field in src/content/.
// Run once from the project folder:  node scripts/download-images.mjs
// Afterwards the old-link fields can be removed from keystatic.config.tsx.
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, basename } from 'node:path';

const out = 'public/media';
// old-link field → upload field (see keystatic.config.tsx)
const moves = { imageUrl: 'image', photoUrl: 'photo', reheatingInstructions: 'reheatingPdf' };
const OLD = /https:\/\/cms\.ammiskitchensheffield\.org\/assets\/[^"'\s]+/g;
await mkdir(out, { recursive: true });

for (const entry of await readdir('src/content', { recursive: true, withFileTypes: true })) {
  if (!entry.isFile() || !/\.(json|mdoc)$/.test(entry.name)) continue;
  const path = join(entry.parentPath, entry.name);
  let text = await readFile(path, 'utf8');
  for (const url of new Set(text.match(OLD) || [])) {
    const name = basename(new URL(url).pathname);
    const res = await fetch(url);
    if (!res.ok) { console.warn('skip', res.status, url); continue; }
    await writeFile(join(out, name), Buffer.from(await res.arrayBuffer()));
    for (const [from, to] of Object.entries(moves)) {
      // JSON ("imageUrl": "https://…") and YAML front matter (imageUrl: https://…)
      text = text.replace(new RegExp(`(["']?)${from}\\1(\\s*:\\s*["']?)${url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`), `$1${to}$1$2/media/${name}`);
    }
    text = text.replaceAll(url, `/media/${name}`);
    console.log('saved', name);
  }
  await writeFile(path, text);
}
console.log('Done. Check public/media/ and commit it.');
