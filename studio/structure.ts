import type { StructureResolver } from 'sanity/structure';

// The left-hand menu staff see in the Studio, in the order they'll use it.
const single = (S: Parameters<StructureResolver>[0], type: string, title: string) =>
  S.listItem().title(title).id(type).schemaType(type).child(S.document().schemaType(type).documentId(type).title(title));

export const structure: StructureResolver = (S) =>
  S.list()
    .title('Content')
    .items([
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
