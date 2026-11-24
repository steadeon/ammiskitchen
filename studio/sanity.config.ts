import { visionTool } from '@sanity/vision';
import { defineConfig } from 'sanity';
import { structureTool } from 'sanity/structure';
import { projectId, dataset } from './env';
import { noCreate, schemaTypes, singletons } from './schemas';
import { structure } from './structure';

export default defineConfig({
  name: 'ammiskitchen',
  title: "Ammi's Kitchen",
  projectId,
  dataset,
  // Served from /admin on the website: set by `project.basePath` in sanity.cli.ts.
  plugins: [structureTool({ structure }), visionTool({ title: 'Query (advanced)' })],
  schema: {
    types: schemaTypes,
    // Don't offer "create new" for one-off pages like the FAQ list, or for orders.
    templates: (templates) => templates.filter(({ schemaType }) => !noCreate.includes(schemaType)),
  },
  document: {
    // One-off pages can't be duplicated or deleted, only edited and published.
    actions: (actions, { schemaType }) =>
      singletons.includes(schemaType)
        ? actions.filter(({ action }) => action && ['publish', 'discardChanges', 'restore'].includes(action))
        : actions,
  },
});
