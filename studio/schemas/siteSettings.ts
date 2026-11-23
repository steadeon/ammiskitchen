import { CogIcon } from '@sanity/icons/Cog';
import { defineField, defineType } from 'sanity';

export const siteSettings = defineType({
  name: 'siteSettings',
  title: 'Contact details & shared text',
  type: 'document',
  icon: CogIcon,
  groups: [
    { name: 'contact', title: 'Contact', default: true },
    { name: 'food', title: 'Food text' },
    { name: 'voucher', title: 'Gift voucher' },
  ],
  fields: [
    defineField({ name: 'name', title: 'Site name', type: 'string', group: 'contact', validation: (r) => r.required() }),
    defineField({ name: 'description', title: 'Short description (for Google and link previews)', type: 'text', rows: 2, group: 'contact' }),
    defineField({ name: 'address', type: 'string', group: 'contact' }),
    defineField({ name: 'email', type: 'string', group: 'contact', validation: (r) => r.email() }),
    defineField({ name: 'phone', type: 'string', group: 'contact' }),
    defineField({ name: 'instagram', title: 'Instagram username', type: 'string', group: 'contact' }),
    defineField({ name: 'facebook', title: 'Facebook page name', type: 'string', group: 'contact' }),
    defineField({ name: 'mailchimp', title: 'Takeaway reminders sign-up link', type: 'url', group: 'contact' }),
    defineField({ name: 'foodWarning', title: 'Allergy warning', description: 'Shown under every menu.', type: 'text', rows: 3, group: 'food' }),
    defineField({ name: 'aboutFood', title: '"About the food" text', description: 'Shown on the order and FAQ pages.', type: 'richText', group: 'food' }),
    defineField({
      name: 'giftVoucher',
      title: 'Gift voucher',
      type: 'object',
      group: 'voucher',
      fields: [
        { name: 'title', type: 'string' },
        { name: 'text', type: 'text', rows: 2 },
        { name: 'buttonText', title: 'Button text', type: 'string' },
        { name: 'url', title: 'Buy link', type: 'url' },
        { name: 'image', type: 'photo' },
      ],
    }),
  ],
  preview: { prepare: () => ({ title: 'Contact details & shared text' }) },
});
