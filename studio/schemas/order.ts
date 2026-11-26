import { ClipboardIcon } from '@sanity/icons/Clipboard';
import { defineArrayMember, defineField, defineType } from 'sanity';

// A takeaway order placed on the website (worker/index.ts creates these).
// Order IDs start with "orders." which keeps them private: only signed-in staff can read them,
// even though the rest of the content is public. They're deleted automatically after a while
// (see ORDER_RETENTION_DAYS in wrangler.jsonc).
export const order = defineType({
  name: 'order',
  title: 'Order',
  type: 'document',
  icon: ClipboardIcon,
  groups: [
    { name: 'order', title: 'Order', default: true },
    { name: 'customer', title: 'Customer' },
    { name: 'payment', title: 'Payment' },
    { name: 'staff', title: 'Staff' },
  ],
  fields: [
    defineField({
      name: 'status',
      title: 'Status',
      type: 'string',
      group: ['order', 'staff'],
      options: {
        list: [
          { title: 'New', value: 'new' },
          { title: 'Packed', value: 'packed' },
          { title: 'Collected / delivered', value: 'done' },
          { title: 'Cancelled', value: 'cancelled' },
          { title: 'Waiting for online payment', value: 'awaitingPayment' },
        ],
        layout: 'radio',
        direction: 'horizontal',
      },
      initialValue: 'new',
    }),
    defineField({
      name: 'paid',
      title: 'Paid',
      description: 'Ticked by itself when a customer pays online. Tick it when someone pays on collection or delivery.',
      type: 'boolean',
      group: ['order', 'staff', 'payment'],
      initialValue: false,
    }),
    defineField({
      name: 'payment',
      title: 'How they chose to pay',
      type: 'string',
      group: 'payment',
      readOnly: true,
      options: { list: [{ title: 'Online (PayPal or card)', value: 'paypal' }, { title: 'On collection / delivery', value: 'later' }] },
    }),
    defineField({ name: 'paidAmount', title: 'Amount paid online (£)', type: 'number', group: 'payment', readOnly: true, hidden: ({ document }) => document?.payment !== 'paypal' }),
    defineField({ name: 'paidAt', title: 'Paid online at', type: 'datetime', group: 'payment', readOnly: true, hidden: ({ document }) => document?.payment !== 'paypal' }),
    defineField({ name: 'refundedAt', title: 'Refunded in PayPal at', type: 'datetime', group: 'payment', readOnly: true, hidden: ({ document }) => !document?.refundedAt }),
    defineField({
      name: 'paypalCaptureId',
      title: 'PayPal transaction ID',
      description: 'Search for this in the charity\'s PayPal account to find the payment (e.g. to refund it).',
      type: 'string',
      group: 'payment',
      readOnly: true,
      hidden: ({ document }) => document?.payment !== 'paypal',
    }),
    defineField({ name: 'paypalOrderId', title: 'PayPal order ID', type: 'string', group: 'payment', readOnly: true, hidden: ({ document }) => document?.payment !== 'paypal' }),
    defineField({ name: 'reference', type: 'string', group: 'order', readOnly: true }),
    defineField({ name: 'takeawayDate', title: 'Takeaway Friday', type: 'date', group: 'order', options: { dateFormat: 'dddd D MMMM YYYY' } }),
    defineField({ name: 'menu', title: 'Set meal', type: 'string', group: 'order' }),
    defineField({
      name: 'method',
      title: 'Collection or delivery',
      type: 'string',
      group: ['order', 'customer'],
      options: { list: [{ title: 'Collection', value: 'collection' }, { title: 'Delivery', value: 'delivery' }], layout: 'radio', direction: 'horizontal' },
    }),
    defineField({
      name: 'items',
      title: 'Meals',
      type: 'array',
      group: 'order',
      of: [
        defineArrayMember({
          type: 'object',
          name: 'orderItem',
          fields: [
            { name: 'option', type: 'string' },
            { name: 'quantity', type: 'number' },
            { name: 'price', title: 'Price each (£)', type: 'number' },
          ],
          preview: {
            select: { option: 'option', quantity: 'quantity', price: 'price' },
            prepare: ({ option, quantity, price }) => ({ title: `${quantity} × ${option}`, subtitle: price != null ? `£${Number(price).toFixed(2)} each` : '' }),
          },
        }),
      ],
    }),
    defineField({ name: 'totalMeals', title: 'Total meals', type: 'number', group: 'order' }),
    defineField({ name: 'totalPrice', title: 'Total to pay (£)', type: 'number', group: 'order' }),
    defineField({ name: 'notes', title: "Customer's notes", type: 'text', rows: 3, group: ['order', 'customer'] }),
    defineField({ name: 'name', type: 'string', group: 'customer' }),
    defineField({ name: 'phone', type: 'string', group: 'customer' }),
    defineField({ name: 'email', type: 'string', group: 'customer' }),
    defineField({ name: 'address', title: 'Delivery address', type: 'text', rows: 3, group: 'customer', hidden: ({ document }) => document?.method !== 'delivery' }),
    defineField({ name: 'postcode', type: 'string', group: 'customer', hidden: ({ document }) => document?.method !== 'delivery' }),
    defineField({ name: 'staffNotes', title: 'Staff notes', description: 'Only staff see this.', type: 'text', rows: 3, group: 'staff' }),
    defineField({ name: 'submittedAt', title: 'Ordered at', type: 'datetime', group: 'order', readOnly: true }),
  ],
  orderings: [
    { title: 'Newest first', name: 'newest', by: [{ field: 'submittedAt', direction: 'desc' }] },
    { title: 'Name', name: 'name', by: [{ field: 'name', direction: 'asc' }] },
  ],
  preview: {
    select: { name: 'name', meals: 'totalMeals', method: 'method', reference: 'reference', status: 'status', date: 'takeawayDate', paid: 'paid', payment: 'payment' },
    prepare: ({ name, meals, method, reference, status, date, paid, payment }) => ({
      title: `${status === 'cancelled' ? '[Cancelled] ' : status === 'awaitingPayment' ? '[Not paid yet] ' : ''}${name ?? 'Order'}`,
      subtitle: [
        meals != null ? `${meals} meal${meals === 1 ? '' : 's'}` : '',
        method === 'delivery' ? 'Delivery' : 'Collection',
        payment === 'paypal' && paid ? 'Paid online' : '',
        date ? new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '',
        reference,
      ]
        .filter(Boolean)
        .join(' · '),
    }),
  },
});
