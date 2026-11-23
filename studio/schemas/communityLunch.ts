import { CalendarIcon } from '@sanity/icons/Calendar';
import { defineField, defineType } from 'sanity';

export const communityLunch = defineType({
  name: 'communityLunch',
  title: 'Community lunch page',
  type: 'document',
  icon: CalendarIcon,
  fields: [
    defineField({ name: 'tagline', type: 'text', rows: 2 }),
    defineField({ name: 'introduction', type: 'richText' }),
    defineField({ name: 'datesHeading', title: 'Dates heading', type: 'string', initialValue: 'Upcoming Lunch Dates' }),
    defineField({
      name: 'dates',
      title: 'Lunch dates',
      description: 'Past dates are hidden on the website automatically.',
      type: 'array',
      of: [{ type: 'date' }],
    }),
  ],
  preview: { prepare: () => ({ title: 'Community lunch page' }) },
});
