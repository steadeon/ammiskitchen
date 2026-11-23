import { defineCliConfig } from 'sanity/cli';
import { projectId, dataset } from './env';

export default defineCliConfig({
  api: { projectId, dataset },
  // Served from /admin on the website, so built files are linked from /admin/static/...
  project: { basePath: process.env.SANITY_STUDIO_BASE_PATH ?? '/admin' },
  // Used only if you choose `npm run deploy` (Sanity-hosted Studio) instead of /admin on the site.
  studioHost: 'ammiskitchen',
});
