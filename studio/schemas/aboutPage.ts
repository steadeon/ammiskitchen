import { InfoOutlineIcon } from '@sanity/icons/InfoOutline';
import { defineField, defineType } from 'sanity';

export const aboutPage = defineType({
  name: 'aboutPage',
  title: 'About page',
  type: 'document',
  icon: InfoOutlineIcon,
  fields: [
    defineField({ name: 'text', type: 'richText' }),
    defineField({ name: 'image', title: 'Photo', type: 'photo' }),
  ],
  preview: { prepare: () => ({ title: 'About page' }) },
});
