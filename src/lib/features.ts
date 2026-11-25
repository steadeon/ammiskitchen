// New features that can be tried out before everyone sees them.
//
// Each feature is either switched on for everyone (a tick box in the Studio, under
// "Contact details & shared text" → "New features"), or, while it's off, only for people who
// have turned it on for themselves at <website>/beta (or with ?beta=on on any page address).
// That personal setting is a cookie, so the website, the Studio at /admin and the Worker
// (worker/index.ts) all see it.

export const BETA_COOKIE = 'ak_beta';

export const FEATURES = {
  ordering: {
    title: 'Online order form',
    description:
      'The new takeaway order form on the Order page, and "Takeaway orders" in the Studio. While it is off, the Order page shows the PayPal and email ordering, as on the old website.',
  },
} as const;

export type Feature = keyof typeof FEATURES;
export const FEATURE_KEYS = Object.keys(FEATURES) as Feature[];

/** Which features this visitor has turned on for themselves, from a Cookie header or document.cookie. */
export function betaFeatures(cookie: string | null | undefined): Feature[] {
  const match = (cookie ?? '').match(new RegExp(`(?:^|;\\s*)${BETA_COOKIE}=([^;]*)`));
  if (!match) return [];
  let value = match[1];
  try { value = decodeURIComponent(value); } catch { /* keep as is */ }
  return value.split(',').filter((f): f is Feature => (FEATURE_KEYS as string[]).includes(f));
}
