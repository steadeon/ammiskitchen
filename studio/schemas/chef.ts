import { UserIcon } from '@sanity/icons/User';
import { defineField, defineType } from 'sanity';

export const chef = defineType({
  name: 'chef',
  title: 'Chef',
  type: 'document',
  icon: UserIcon,
  fields: [
    defineField({ name: 'name', type: 'string', validation: (r) => r.required() }),
    defineField({ name: 'photo', type: 'photo' }),
    defineField({ name: 'description', title: 'About the chef', type: 'text', rows: 4 }),
  ],
  preview: { select: { title: 'name', media: 'photo' } },
});
