import { DocumentTextIcon } from '@sanity/icons/DocumentText';
import { defineArrayMember, defineField, defineType } from 'sanity';

export const menu = defineType({
  name: 'menu',
  title: 'Set meal',
  type: 'document',
  icon: DocumentTextIcon,
  fields: [
    defineField({ name: 'title', type: 'string', validation: (r) => r.required() }),
    defineField({
      name: 'slug',
      title: 'Page address',
      description: 'The end of the page link: ammiskitchensheffield.org/menu/… Click "Generate" to make it from the title.',
      type: 'slug',
      options: { source: 'title', maxLength: 120 },
      validation: (r) => r.required(),
    }),
    defineField({ name: 'cookedOn', title: 'Date cooked', description: 'Used to list past menus, newest first.', type: 'date' }),
    defineField({ name: 'chef', type: 'reference', to: [{ type: 'chef' }] }),
    defineField({ name: 'image', title: 'Photo', type: 'photo', validation: (r) => r.required() }),
    defineField({
      name: 'items',
      title: 'Dishes',
      type: 'array',
      of: [
        defineArrayMember({
          type: 'object',
          name: 'dish',
          fields: [
            { name: 'name', type: 'string', validation: (r) => r.required() },
            { name: 'description', type: 'text', rows: 2 },
          ],
          preview: { select: { title: 'name', subtitle: 'description' } },
        }),
      ],
      validation: (r) => r.min(1),
    }),
    defineField({ name: 'ingredients', title: 'Full ingredients (optional)', type: 'richText' }),
    // Keeps imported menus in their original order when they have no date. Not shown to staff.
    defineField({ name: 'legacyOrder', type: 'number', hidden: true }),
    defineField({ name: 'reheatingInstructions', title: 'Reheating instructions (PDF)', type: 'file', options: { accept: 'application/pdf' } }),
  ],
  orderings: [{ title: 'Newest first', name: 'cookedDesc', by: [{ field: 'cookedOn', direction: 'desc' }] }],
  preview: { select: { title: 'title', subtitle: 'cookedOn', media: 'image' } },
});
