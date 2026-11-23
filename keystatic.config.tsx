// Keystatic: the editing screens staff use at /admin (which redirects to /keystatic).
// Every form below maps to a file in src/content/. Saving a form commits that file to
// GitHub, and Cloudflare rebuilds the site from it a minute or two later.
import { config, collection, singleton, fields } from '@keystatic/core';

// Where saves go:
//   local  → files on this computer (default for `npm run dev`)
//   github → straight to the GitHub repo; each editor signs in with a GitHub account
//   cloud  → via Keystatic Cloud; editors sign in with email, no GitHub account needed
const mode = import.meta.env.PUBLIC_KEYSTATIC_STORAGE ?? (import.meta.env.DEV ? 'local' : 'github');
const storage =
  mode === 'cloud'
    ? ({ kind: 'cloud' } as const)
    : mode === 'github'
      ? ({ kind: 'github', repo: 'steadeon/ammiskitchen' } as const)
      : ({ kind: 'local' } as const);

// Uploaded photos and PDFs live in public/media/ and are served from /media/.
const photo = (label: string, description?: string) =>
  fields.image({ label, description, directory: 'public/media', publicPath: '/media/' });
const pdf = (label: string, description?: string) =>
  fields.file({ label, description, directory: 'public/media', publicPath: '/media/' });
// Existing entries still link to photos/PDFs on the old website. Those links sit in a
// separate field so saving a form never wipes them; an upload always takes priority.
// TODO: once the official asset export arrives, copy the files into public/media/ and drop these.
const oldLink = (what: string) =>
  fields.url({ label: `${what} link (old website)`, description: 'Only used if nothing is uploaded above.' });

// Simple rich text: paragraphs, bold/italic, links and lists. No headings, tables or images,
// so the page design can't be broken from the editor.
const richText = (label: string, description?: string) =>
  fields.markdoc({
    label,
    description,
    options: {
      heading: false,
      blockquote: false,
      codeBlock: false,
      code: false,
      image: false,
      table: false,
      strikethrough: false,
      divider: false,
    },
  });

export default config({
  storage,
  ...(mode === 'cloud' && {
    // TODO: replace with the team/project name created at https://keystatic.cloud
    cloud: { project: 'ammis-kitchen/website' },
  }),
  ui: {
    brand: {
      name: "Ammi's Kitchen",
      mark: () => <img src="/favicon.svg" alt="" width={24} height={24} />,
    },
    navigation: {
      'Takeaway': ['order', 'menus', 'chefs'],
      'Pages': ['about', 'communityLunch', 'faqs'],
      'Settings': ['settings'],
    },
  },

  singletons: {
    order: singleton({
      label: "This fortnight's takeaway",
      path: 'src/content/order/',
      format: { data: 'json' },
      schema: {
        currentMenu: fields.relationship({
          label: 'Menu on sale now',
          description: 'Pick the set meal for this fortnight. Add a new one under "Set meals" first if it isn\'t listed.',
          collection: 'menus',
          validation: { isRequired: true },
        }),
        orderBefore: fields.datetime({
          label: 'Order deadline',
          description: 'UK time. Shown on the order page.',
          validation: { isRequired: true },
        }),
        featuredChef: fields.relationship({
          label: 'Featured chef',
          description: 'Shown in "Meet the chef". Add new chefs under "Chefs".',
          collection: 'chefs',
          validation: { isRequired: true },
        }),
        options: fields.array(
          fields.object({
            type: fields.text({ label: 'Option name', validation: { isRequired: true } }),
            price: fields.number({ label: 'Price (£)', validation: { isRequired: true, min: 0 } }),
            description: fields.text({ label: 'Description', multiline: true }),
            url: fields.url({ label: 'PayPal payment link', validation: { isRequired: true } }),
          }),
          {
            label: 'Ways to order',
            description: 'Each becomes a payment button on the order page.',
            itemLabel: (p) => `${p.fields.type.value} · £${p.fields.price.value ?? ''}`,
          },
        ),
      },
    }),

    about: singleton({
      label: 'About page',
      path: 'src/content/about/',
      format: { data: 'json' },
      schema: {
        text: richText('Main text'),
        image: photo('Photo'),
        imageUrl: oldLink('Photo'),
        imageAlt: fields.text({ label: 'Photo description', description: 'For people using screen readers.' }),
      },
    }),

    communityLunch: singleton({
      label: 'Community lunch page',
      path: 'src/content/community-lunch/',
      format: { data: 'json' },
      schema: {
        tagline: fields.text({ label: 'Tagline', multiline: true }),
        introduction: richText('Introduction'),
        datesHeading: fields.text({ label: 'Dates heading', defaultValue: 'Upcoming Lunch Dates' }),
        dates: fields.array(fields.date({ label: 'Date', validation: { isRequired: true } }), {
          label: 'Lunch dates',
          description: 'Past dates hide themselves automatically.',
          itemLabel: (p) => p.value ?? 'New date',
        }),
      },
    }),

    settings: singleton({
      label: 'Contact details & shared text',
      path: 'src/content/settings/',
      format: { data: 'json' },
      schema: {
        name: fields.text({ label: 'Site name' }),
        description: fields.text({ label: 'Short description', description: 'Used by search engines and link previews.', multiline: true }),
        address: fields.text({ label: 'Address' }),
        email: fields.text({ label: 'Email' }),
        phone: fields.text({ label: 'Phone' }),
        instagram: fields.text({ label: 'Instagram username' }),
        facebook: fields.text({ label: 'Facebook page name' }),
        mailchimp: fields.url({ label: 'Mailing list sign-up link' }),
        foodWarning: fields.text({ label: 'Allergy warning', description: 'Shown under every menu.', multiline: true }),
        aboutFood: richText('About the food', 'Shown on the order and FAQ pages.'),
        giftVoucher: fields.object(
          {
            title: fields.text({ label: 'Heading' }),
            text: fields.text({ label: 'Text', multiline: true }),
            buttonText: fields.text({ label: 'Button text' }),
            url: fields.url({ label: 'Button link' }),
            image: photo('Picture'),
            imageUrl: oldLink('Picture'),
          },
          { label: 'Gift voucher box' },
        ),
      },
    }),
  },

  collections: {
    menus: collection({
      label: 'Set meals',
      path: 'src/content/menus/*',
      slugField: 'title',
      format: { contentField: 'ingredients' },
      entryLayout: 'form',
      columns: ['title'],
      schema: {
        title: fields.slug({
          name: { label: 'Menu name' },
          slug: { label: 'Page address', description: 'The menu appears at /menu/<this>.' },
        }),
        image: photo('Photo'),
        imageUrl: oldLink('Photo'),
        imageAlt: fields.text({ label: 'Photo description' }),
        items: fields.array(
          fields.object({
            name: fields.text({ label: 'Dish', validation: { isRequired: true } }),
            description: fields.text({ label: 'Description', multiline: true }),
          }),
          { label: 'Dishes', itemLabel: (p) => p.fields.name.value || 'New dish' },
        ),
        reheatingPdf: pdf('Reheating instructions (PDF)'),
        reheatingInstructions: oldLink('Reheating instructions'),
        order: fields.integer({
          label: 'Position in "Past menus"',
          description: 'Lower numbers show first.',
          defaultValue: 0,
        }),
        ingredients: richText('Full ingredients', 'Put allergens in bold. Leave empty to show "available on request".'),
      },
    }),

    chefs: collection({
      label: 'Chefs',
      path: 'src/content/chefs/*',
      slugField: 'name',
      format: { data: 'json' },
      schema: {
        name: fields.slug({ name: { label: 'Name' } }),
        photo: photo('Photo'),
        photoUrl: oldLink('Photo'),
        description: fields.text({ label: 'About this chef', multiline: true }),
      },
    }),

    faqs: collection({
      label: 'FAQs',
      path: 'src/content/faqs/*',
      slugField: 'question',
      format: { contentField: 'answer' },
      entryLayout: 'form',
      columns: ['question', 'order'],
      schema: {
        question: fields.slug({ name: { label: 'Question' } }),
        order: fields.integer({ label: 'Position', description: 'Lower numbers show first.', defaultValue: 0 }),
        answer: richText('Answer'),
      },
    }),
  },
});
