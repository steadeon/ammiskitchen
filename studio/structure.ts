import { ClipboardIcon } from '@sanity/icons/Clipboard';
import { DownloadIcon } from '@sanity/icons/Download';
import type { StructureResolver } from 'sanity/structure';
import { OrdersExport } from './components/OrdersExport';

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
  // Orders that count: everything except "Pay now" orders still waiting for the money.
  const placed = '_type == "order" && status != "awaitingPayment"';
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
            .child(list('This takeaway', `${placed} && takeawayDate == *[_id == "takeaway"][0].takeawayDate`)),
          S.listItem().title('Upcoming').id('orders-upcoming').icon(ClipboardIcon)
            .child(list('Upcoming', `${placed} && takeawayDate >= $today`, { today })),
          S.listItem().title('All orders').id('orders-all').icon(ClipboardIcon).child(list('All orders', placed)),
          // Customers who chose "Pay now" but didn't finish paying. Not real orders; deleted after 2 days.
          S.listItem().title('Unfinished online payments').id('orders-unpaid').icon(ClipboardIcon)
            .child(list('Unfinished online payments', '_type == "order" && status == "awaitingPayment"')),
          S.divider(),
          S.listItem().title('Download spreadsheet').id('orders-export').icon(DownloadIcon)
            .child(S.component(OrdersExport).id('orders-export').title('Download orders spreadsheet')),
        ]),
    );
};

// "Takeaway orders" is always shown: only signed-in staff can open the Studio, so there is nothing to hide
// from the public here. The order form on the website itself stays behind its beta switch (src/lib/features.ts).
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
