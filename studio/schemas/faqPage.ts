import { HelpCircleIcon } from '@sanity/icons/HelpCircle';
import { defineArrayMember, defineField, defineType } from 'sanity';

// One list, so questions can be reordered by dragging.
export const faqPage = defineType({
  name: 'faqPage',
  title: 'FAQs',
  type: 'document',
  icon: HelpCircleIcon,
  fields: [
    defineField({
      name: 'items',
      title: 'Questions',
      description: 'Drag to reorder. Shown on the FAQ and About pages.',
      type: 'array',
      of: [
        defineArrayMember({
          type: 'object',
          name: 'faq',
          fields: [
            { name: 'question', type: 'string', validation: (r) => r.required() },
            { name: 'answer', type: 'richText' },
          ],
          preview: { select: { title: 'question' } },
        }),
      ],
    }),
  ],
  preview: { prepare: () => ({ title: 'FAQs' }) },
});
