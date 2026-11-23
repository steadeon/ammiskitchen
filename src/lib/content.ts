// Reads the content files that staff edit through Keystatic (src/content/) at build time.
// Rich-text fields are turned into HTML here so pages can drop them straight in.
import { createReader } from '@keystatic/core/reader';
import Markdoc, { type Node } from '@markdoc/markdoc';
import config from '../../keystatic.config';

const reader = createReader(process.cwd(), config);
const html = (doc: { node: Node }) =>
  (Markdoc.renderers.html(Markdoc.transform(doc.node)) as string).replace(/^<article>|<\/article>$/g, '').trim();
// An uploaded file wins over the old-website link it replaces.
const pick = (upload: string | null | undefined, oldLink: string | null | undefined) => upload || oldLink || null;
const once = <T>(fn: () => Promise<T>) => { let p: Promise<T> | undefined; return () => (p ??= fn()); };

export const getSettings = once(async () => {
  const s = await reader.singletons.settings.readOrThrow({ resolveLinkedFiles: true });
  return {
    ...s,
    aboutFood: html(s.aboutFood),
    giftVoucher: { ...s.giftVoucher, image: pick(s.giftVoucher.image, s.giftVoucher.imageUrl) },
  };
});

export const getAbout = once(async () => {
  const a = await reader.singletons.about.readOrThrow({ resolveLinkedFiles: true });
  return { ...a, text: html(a.text), image: pick(a.image, a.imageUrl) };
});

export const getCommunityLunch = once(async () => {
  const l = await reader.singletons.communityLunch.readOrThrow({ resolveLinkedFiles: true });
  return { ...l, introduction: html(l.introduction) };
});

export const getFaqs = once(async () => {
  const all = await reader.collections.faqs.all({ resolveLinkedFiles: true });
  return all
    .sort((a, b) => (a.entry.order ?? 0) - (b.entry.order ?? 0))
    .map(({ entry }) => ({ q: entry.question, a: html(entry.answer) }));
});

export type Menu = Awaited<ReturnType<typeof getMenus>>[number];
export const getMenus = once(async () => {
  const all = await reader.collections.menus.all({ resolveLinkedFiles: true });
  return all
    .map(({ slug, entry }) => {
      const ingredients = html(entry.ingredients);
      return {
        ...entry,
        slug,
        image: pick(entry.image, entry.imageUrl),
        reheatingInstructions: pick(entry.reheatingPdf, entry.reheatingInstructions),
        ingredients: ingredients || null,
      };
    })
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
});

export const getOrder = once(async () => {
  const o = await reader.singletons.order.readOrThrow();
  const menus = await getMenus();
  const currentMenu = menus.find((m) => m.slug === o.currentMenu);
  if (!currentMenu) throw new Error(`"Menu on sale now" (${o.currentMenu}) doesn't match any set meal`);
  const chef = o.featuredChef ? await reader.collections.chefs.read(o.featuredChef) : null;
  const featuredChef = chef && { ...chef, photo: pick(chef.photo, chef.photoUrl) };
  return { ...o, currentMenu, featuredChef };
});
