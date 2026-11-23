import { defineType } from 'sanity';

// A photo with a short description for people using screen readers.
export const photo = defineType({
  name: 'photo',
  title: 'Photo',
  type: 'image',
  options: { hotspot: true },
  fields: [
    {
      name: 'alt',
      type: 'string',
      title: 'Describe the photo',
      description: 'A few words for people who cannot see the image, e.g. "Bowls of dal and rice on a table".',
    },
  ],
});
