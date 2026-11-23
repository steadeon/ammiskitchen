// The Sanity project this Studio edits. Shared with the website in ../sanity.project.json
// (not secret). SANITY_STUDIO_PROJECT_ID / SANITY_STUDIO_DATASET override it if set.
import project from '../sanity.project.json';

export const projectId = process.env.SANITY_STUDIO_PROJECT_ID || project.projectId;
export const dataset = process.env.SANITY_STUDIO_DATASET || project.dataset;
