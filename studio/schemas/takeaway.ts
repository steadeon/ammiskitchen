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
      name: 'orderBefore',
      title: 'Order deadline',
      description: 'Usually 5pm on the Tuesday before cooking.',
      type: 'datetime',
      options: { timeStep: 15 },
      validation: (r) => r.required(),
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
            { name: 'description', type: 'text', rows: 2 },
            { name: 'url', title: 'PayPal link', type: 'url', validation: (r) => r.required() },
          ],
          preview: {
            select: { title: 'type', price: 'price' },
            prepare: ({ title, price }) => ({ title, subtitle: price != null ? `£${Number(price).toFixed(2)}` : '' }),
          },
        }),
      ],
    }),
  ],
  preview: { prepare: () => ({ title: "This fortnight's takeaway" }) },
});
