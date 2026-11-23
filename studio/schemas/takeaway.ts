import { BasketIcon } from '@sanity/icons/Basket';
import { defineArrayMember, defineField, defineType } from 'sanity';

// Everything that changes each fortnight on the Order Takeaway page.
export const takeaway = defineType({
  name: 'takeaway',
  title: "This fortnight's takeaway",
  type: 'document',
  icon: BasketIcon,
  fields: [
    defineField({
      name: 'currentMenu',
      title: 'Current menu',
      description: 'Pick the set meal for this fortnight. Add a new one under "Set meals" first if needed.',
      type: 'reference',
      to: [{ type: 'menu' }],
      validation: (r) => r.required(),
    }),
    defineField({
      name: 'takeawayDate',
      title: 'Takeaway Friday',
      description: 'The day meals are collected and delivered. Online orders close by themselves at 5pm on the Tuesday before.',
      type: 'date',
      options: { dateFormat: 'dddd D MMMM YYYY' },
      validation: (r) => r.required(),
    }),
    defineField({
      name: 'orderBefore',
      title: 'Custom order deadline (optional)',
      description: 'Only fill this in to close orders at a different time from the usual 5pm on the Tuesday before. Leave empty otherwise.',
      type: 'datetime',
      options: { timeStep: 15 },
    }),
    defineField({ name: 'featuredChef', title: 'Meet the chef', type: 'reference', to: [{ type: 'chef' }] }),
    defineField({
      name: 'options',
      title: 'Ordering options',
      type: 'array',
      of: [
        defineArrayMember({
          type: 'object',
          name: 'orderOption',
          fields: [
            { name: 'type', title: 'Name', type: 'string', validation: (r) => r.required() },
            { name: 'price', title: 'Price (£)', type: 'number', validation: (r) => r.required().min(0) },
            {
              name: 'method',
              title: 'Collection or delivery?',
              type: 'string',
              options: { list: [{ title: 'Collection', value: 'collection' }, { title: 'Delivery', value: 'delivery' }], layout: 'radio', direction: 'horizontal' },
              initialValue: 'collection',
            },
            { name: 'description', type: 'text', rows: 2 },
            { name: 'url', title: 'PayPal link (optional)', description: 'For people who want to pay in advance.', type: 'url' },
          ],
          preview: {
            select: { title: 'type', price: 'price', method: 'method' },
            prepare: ({ title, price, method }) => ({
              title,
              subtitle: [price != null ? `£${Number(price).toFixed(2)}` : '', method === 'delivery' ? 'Delivery' : method ? 'Collection' : '']
                .filter(Boolean)
                .join(' · '),
            }),
          },
        }),
      ],
    }),
  ],
  preview: { prepare: () => ({ title: "This fortnight's takeaway" }) },
});
