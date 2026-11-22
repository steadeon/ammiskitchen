// Copies every image/PDF the site still loads from the old CMS into public/media/,
// then rewrites the data files to point at the local copies.
// Run once from the project folder:  node scripts/download-images.mjs
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, basename } from 'node:path';

const OLD = 'https://cms.ammiskitchensheffield.org/assets/';
const files = ['src/data', 'src/data/menus'];
const out = 'public/media';
await mkdir(out, { recursive: true });

for (const dir of files) {
  for (const f of (await readdir(dir)).filter((n) => n.endsWith('.json'))) {
    const path = join(dir, f);
    let text = await readFile(path, 'utf8');
    const urls = [...new Set(text.match(/https:\/\/cms\.ammiskitchensheffield\.org\/assets\/[^"\s]+/g) || [])];
    for (const url of urls) {
      const name = basename(new URL(url).pathname);
      const res = await fetch(url);
      if (!res.ok) { console.warn('skip', res.status, url); continue; }
      await writeFile(join(out, name), Buffer.from(await res.arrayBuffer()));
      text = text.replaceAll(url, `/media/${name}`);
      console.log('saved', name);
    }
    await writeFile(path, text);
  }
}
console.log('Done. Check public/media/ and commit it.');
