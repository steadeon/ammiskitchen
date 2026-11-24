import { ClipboardIcon } from '@sanity/icons/Clipboard';
import type { StructureResolver } from 'sanity/structure';

// The left-hand menu staff see in the Studio, in the order they'll use it.
const single = (S: Parameters<StructureResolver>[0], type: string, title: string) =>
  S.listItem().title(title).id(type).schemaType(type).child(S.document().schemaType(type).documentId(type).title(title));

// Takeaway orders from the website, grouped so staff see this Friday's first.
const orders = (S: Parameters<StructureResolver>[0]) => {
  const list = (title: string, filter: string, params: Record<string, unknown> = {}) =>
    S.documentTypeList('order')
      .title(title)
      .filter(filter)
      .params(params)
      .initialValueTemplates([])
      .defaultOrdering([{ field: 'submittedAt', direction: 'desc' }]);
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
  return S.listItem()
    .title('Takeaway orders')
    .id('orders')
    .icon(ClipboardIcon)
    .child(
      S.list()
        .title('Takeaway orders')
        .items([
          S.listItem().title('This takeaway').id('orders-current').icon(ClipboardIcon)
            .child(list('This takeaway', '_type == "order" && takeawayDate == *[_id == "takeaway"][0].takeawayDate')),
          S.listItem().title('Upcoming').id('orders-upcoming').icon(ClipboardIcon)
            .child(list('Upcoming', '_type == "order" && takeawayDate >= $today', { today })),
          S.listItem().title('All orders').id('orders-all').icon(ClipboardIcon).child(list('All orders', '_type == "order"')),
        ]),
    );
};

export const structure: StructureResolver = (S) =>
  S.list()
    .title('Content')
    .items([
      orders(S),
      S.divider(),
      single(S, 'takeaway', "This fortnight's takeaway"),
      S.documentTypeListItem('menu').title('Set meals'),
      S.documentTypeListItem('chef').title('Chefs'),
      S.divider(),
      single(S, 'communityLunch', 'Community lunch page'),
      single(S, 'aboutPage', 'About page'),
      single(S, 'faqPage', 'FAQs'),
      S.divider(),
      single(S, 'siteSettings', 'Contact details & shared text'),
    ]);
