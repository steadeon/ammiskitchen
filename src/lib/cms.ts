// Where the site's words and photos come from.
//
// Content is fetched from Sanity (project in /sanity.project.json) when the site is built,
// so publishing in the Studio + a rebuild updates the site. The JSON files in src/data/ are
// the fallback: they're used for anything not yet published in Sanity, when Sanity is
// switched off (SANITY_DISABLED=1), or when Sanity can't be reached on a local machine.
// Each function returns the same shape either way, so pages don't care which source is used.
import { createClient, type SanityClient } from '@sanity/client';
import { createImageUrlBuilder } from '@sanity/image-url';
import { toHTML } from '@portabletext/to-html';

import siteJson from '../data/site.json';
import orderJson from '../data/order.json';
import lunchJson from '../data/community-lunch.json';
import aboutJson from '../data/about.json';
import faqJson from '../data/faq.json';

import project from '../../sanity.project.json';
import { methodOf, schedule, type OrderOption, type Schedule } from './ordering';

const env = (key: string): string | undefined => (import.meta.env?.[key] as string | undefined) || process.env[key];

const projectId = env('SANITY_DISABLED') ? '' : env('SANITY_STUDIO_PROJECT_ID') || project.projectId;
const dataset = env('SANITY_STUDIO_DATASET') || project.dataset;
// On Cloudflare (Pages or Workers Builds) or any CI a Sanity error stops the build, so the live site never
// silently goes back to old content. Locally we just warn and use the JSON files.
const strict = Boolean(process.env.CF_PAGES || process.env.WORKERS_CI || process.env.CI);

export const sanityEnabled = Boolean(projectId);

const client: SanityClient | null = projectId
  ? createClient({ projectId, dataset, apiVersion: '2026-11-01', useCdn: false, perspective: 'published' })
  : null;
const images = client ? createImageUrlBuilder(client) : null;

// ---- helpers --------------------------------------------------------------------------

type SanityImage = { asset?: { _id: string; metadata?: { dimensions?: { width: number; height: number } } }; alt?: string } | null;

/** A resized, web-optimised URL for a Sanity photo. */
export function imageUrl(img: SanityImage, width = 1600): string {
  if (!img?.asset || !images) return '';
  return images.image(img).width(width).fit('max').auto('format').url();
}

const html = (blocks: unknown): string => (Array.isArray(blocks) && blocks.length ? toHTML(blocks as never) : '');

// Expands a photo field to include its file URL and size.
const IMG = '{ alt, hotspot, crop, asset->{ _id, url, metadata { dimensions } } }';

let warnedOffline = false;
async function query<T>(groq: string, params: Record<string, unknown> = {}): Promise<T | null> {
  if (!client) return null;
  try {
    return await client.fetch<T>(groq, params);
  } catch (err) {
    if (strict) throw new Error(`Couldn't load content from Sanity: ${(err as Error).message}`);
    if (!warnedOffline) console.warn(`[cms] Can't reach Sanity (${(err as Error).message}), using src/data JSON instead.`);
    warnedOffline = true;
    return null;
  }
}

async function fetchDoc<T>(id: string, projection: string): Promise<T | null> {
  if (!client) return null;
  const doc = await query<T | null>(`*[_id == $id][0]${projection}`, { id });
  if (warnedOffline) return null;
  if (!doc) console.warn(`[cms] "${id}" isn't published in Sanity yet, using src/data JSON instead.`);
  return doc;
}

// Each piece of content is fetched once per build, however many pages use it.
const once = <T>(fn: () => Promise<T>) => {
  let p: Promise<T> | undefined;
  return () => (p ??= fn());
};

// ---- content --------------------------------------------------------------------------

export type Site = typeof siteJson;

export const getSite = once(async (): Promise<Site> => {
  const d = await fetchDoc<any>('siteSettings', `{ ..., giftVoucher { ..., image ${IMG} } }`);
  if (!d) return siteJson;
  return {
    ...siteJson,
    name: d.name ?? siteJson.name,
    description: d.description ?? '',
    address: d.address ?? '',
    email: d.email ?? '',
    phone: d.phone ?? '',
    facebook: d.facebook ?? '',
    instagram: d.instagram ?? '',
    mailchimp: d.mailchimp ?? '',
    foodWarning: d.foodWarning ?? '',
    aboutFood: html(d.aboutFood),
    giftVoucher: {
      title: d.giftVoucher?.title ?? '',
      text: d.giftVoucher?.text ?? '',
      buttonText: d.giftVoucher?.buttonText ?? '',
      url: d.giftVoucher?.url ?? '',
      image: imageUrl(d.giftVoucher?.image, 800),
    },
    features: { onlineOrdering: Boolean(d.features?.onlineOrdering), onlinePayments: Boolean(d.features?.onlinePayments) },
  };
});

export interface Order {
  currentMenu: string;
  /** Takeaway date and order deadline, worked out from what staff entered. */
  schedule: Schedule;
  featuredChef: { name: string; description: string; photo: string };
  options: OrderOption[];
}

const toOptions = (opts: any[]): OrderOption[] =>
  (opts ?? []).map((o: any, i: number) => ({
    key: o._key ?? String(i),
    type: o.type,
    price: Number(o.price) || 0,
    description: o.description ?? '',
    method: methodOf(o),
    url: o.url ?? '',
  }));

export const getOrder = once(async (): Promise<Order> => {
  const d = await fetchDoc<any>(
    'takeaway',
    `{ takeawayDate, orderBefore, options, "currentMenu": currentMenu->slug.current, featuredChef->{ name, description, photo ${IMG} } }`,
  );
  if (!d) {
    return {
      currentMenu: orderJson.currentMenu,
      schedule: schedule(orderJson.takeawayDate, orderJson.orderBefore),
      featuredChef: orderJson.featuredChef,
      options: toOptions(orderJson.options),
    };
  }
  return {
    currentMenu: d.currentMenu,
    schedule: schedule(d.takeawayDate, d.orderBefore),
    featuredChef: {
      name: d.featuredChef?.name ?? '',
      description: d.featuredChef?.description ?? '',
      photo: imageUrl(d.featuredChef?.photo, 300),
    },
    options: toOptions(d.options),
  };
});

export const getCommunityLunch = once(async (): Promise<typeof lunchJson> => {
  const d = await fetchDoc<any>('communityLunch', '{ tagline, introduction, datesHeading, dates }');
  if (!d) return lunchJson;
  return {
    tagline: d.tagline ?? '',
    introduction: html(d.introduction),
    datesHeading: d.datesHeading ?? 'Upcoming Lunch Dates',
    dates: [...(d.dates ?? [])].sort(),
  };
});

export const getAbout = once(async (): Promise<typeof aboutJson> => {
  const d = await fetchDoc<any>('aboutPage', `{ text, image ${IMG} }`);
  if (!d) return aboutJson;
  const dims = d.image?.asset?.metadata?.dimensions;
  return {
    text: html(d.text),
    image: imageUrl(d.image),
    imageWidth: 1600,
    imageHeight: dims ? Math.round((1600 * dims.height) / dims.width) : 1067,
    imageAlt: d.image?.alt ?? '',
  };
});

export const getFaq = once(async (): Promise<{ q: string; a: string }[]> => {
  const d = await fetchDoc<any>('faqPage', '{ items[]{ question, answer } }');
  if (!d) return faqJson;
  return (d.items ?? []).map((i: any) => ({ q: i.question, a: html(i.answer) }));
});

/** Set meals from Sanity, newest first, shaped like the files in src/data/menus/. */
export async function fetchMenus() {
  const docs = (await query<any[]>(
    `*[_type == "menu" && defined(slug.current)] | order(coalesce(cookedOn, "0000-00-00") desc, legacyOrder asc, _createdAt desc) {
      "id": slug.current, title, image ${IMG}, items[]{ name, description }, ingredients,
      "reheatingInstructions": reheatingInstructions.asset->url
    }`,
  )) ?? [];
  return docs.map((m, i) => ({
    id: m.id,
    title: m.title,
    order: i,
    image: imageUrl(m.image),
    imageAlt: m.image?.alt ?? '',
    items: (m.items ?? []).map((it: any) => ({ name: it.name ?? '', description: it.description ?? '' })),
    ingredients: html(m.ingredients) || null,
    ...(m.reheatingInstructions ? { reheatingInstructions: m.reheatingInstructions } : {}),
  }));
}
