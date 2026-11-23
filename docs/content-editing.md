# Content editing (Keystatic)

Staff edit the site at `/admin`, which opens the [Keystatic](https://keystatic.com) editor at
`/keystatic`. Every form saves to a file in `src/content/`. Keystatic commits that file to GitHub,
and Cloudflare rebuilds the site from the new commit, usually within two minutes.

```
staff at /admin  →  Keystatic  →  commit to GitHub (main)  →  Cloudflare build  →  live site
```

Nothing else changes for visitors: every public page is still plain, pre-built HTML. Only the
editor itself (`/keystatic` and `/api/keystatic`) runs on demand.

## Where saves go

`keystatic.config.tsx` picks a storage mode from the `PUBLIC_KEYSTATIC_STORAGE` build variable:

| Value | Who can sign in | Use it for |
|---|---|---|
| `local` (default for `npm run dev`) | Anyone running the site on their own computer | Trying things out; edits change files on disk |
| `github` (default for builds) | People with a GitHub account that has write access to the repo | Paul and anyone technical |
| `cloud` | People invited to the Keystatic Cloud project by email | **Charity staff without GitHub accounts** |

## Login options for staff

Keystatic itself has no usernames or passwords. Sign-in comes from one of these:

1. **Keystatic Cloud (recommended for staff).** Staff are invited by email and sign in at
   keystatic.cloud. Keystatic Cloud holds the connection to GitHub and makes the commits for them,
   so they never see GitHub. There is a free tier for small teams; check the current user limit at
   https://keystatic.cloud before relying on it. No server secrets are needed.
   Setup:
   1. Create a team and project at https://keystatic.cloud and connect it to `steadeon/ammiskitchen`.
   2. Put the `team/project` name in `cloud.project` in `keystatic.config.tsx`.
   3. Set the build variable `PUBLIC_KEYSTATIC_STORAGE=cloud` in Cloudflare and redeploy.
   4. Invite staff from the Keystatic Cloud dashboard.
2. **GitHub accounts.** Each editor creates a free GitHub account and is added as a collaborator
   on the repo. Simplest technically, but every staff member needs a GitHub login.
3. **A shared charity GitHub account.** One "Ammi's Kitchen editor" GitHub account used by staff.
   It works, but you lose a record of who changed what, and it means sharing a password.

Any of these can sit behind **Cloudflare Access** as an extra lock on `/keystatic` (free for small
teams; staff get a one-time code by email). That's optional.

## GitHub mode setup (one-off, for Paul)

1. Run `PUBLIC_KEYSTATIC_STORAGE=github npm run dev` and open http://127.0.0.1:4321/keystatic.
   Keystatic walks you through creating a GitHub App for the repo and writes the values to `.env`
   (git-ignored, so never committed).
2. In the GitHub App settings, add the live callback URL:
   `https://<your domain>/api/keystatic/github/oauth/callback`
   (and the same with your `*.workers.dev` address if you want to edit on previews).
3. Copy the values into Cloudflare (Worker → Settings → Variables and Secrets):
   - Secrets: `KEYSTATIC_GITHUB_CLIENT_ID`, `KEYSTATIC_GITHUB_CLIENT_SECRET`, `KEYSTATIC_SECRET`
   - Build variable: `PUBLIC_KEYSTATIC_GITHUB_APP_SLUG`

## Hosting on Cloudflare

Cloudflare is still a good fit. The one change: because the editor needs a little server code,
the site now deploys as a **Cloudflare Worker with static assets** (Cloudflare's current
recommendation for Astro) rather than a Pages project. It still deploys from GitHub on every
push, gives each branch a preview URL, and the free plan covers a site this size comfortably.

This repo is already connected to a Workers project called `ammiskitchen` (Workers Builds), so
nothing needs changing there. For reference, or to set it up again: Workers & Pages → Create →
Import a repository → `steadeon/ammiskitchen`, then:

| Setting | Value |
|---|---|
| Project name | `ammiskitchen` (must match `name` in `wrangler.jsonc`) |
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy` |
| Non-production branch deploy command | `npx wrangler versions upload` |

The build writes the Worker config to `dist/server/wrangler.json`, which `wrangler` finds on its own.

If a Pages project was already connected to this repo, this branch's build there won't work
(Pages expects a plain `dist/` folder); remove it once the Worker is set up.

## Photos and PDFs

Uploads go to `public/media/` and are committed with the change. Older entries still link to the
old website's files through the "link (old website)" fields; an upload always takes priority.
When the official asset export arrives, run `node scripts/download-images.mjs` (or copy the files
in by hand) and then remove those fields from `keystatic.config.tsx`.
