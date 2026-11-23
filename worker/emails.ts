// The two emails sent for each order: a confirmation to the customer and an alert to staff.
import { money, type Method } from '../src/lib/ordering';

export interface PlacedOrder {
  reference: string;
  name: string;
  phone: string;
  email: string;
  method: Method;
  address: string;
  postcode: string;
  notes: string;
  items: { option: string; quantity: number; price: number }[];
  totalMeals: number;
  totalPrice: number;
  menu: string;
  day: string;
  site: { name: string; email: string; phone: string; address: string };
  adminUrl: string;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const nl = (s: string) => esc(s).replace(/\n/g, '<br>');

const itemsText = (o: PlacedOrder) => o.items.map((i) => `${i.quantity} × ${i.option} (${money(i.price)} each)`).join('\n');
const itemsHtml = (o: PlacedOrder) =>
  o.items.map((i) => `<tr><td style="padding:4px 12px 4px 0">${i.quantity} × ${esc(i.option)}</td><td style="padding:4px 0;text-align:right">${money(i.quantity * i.price)}</td></tr>`).join('') +
  `<tr><td style="padding:8px 12px 4px 0;border-top:1px solid #e5c9a0"><strong>Total to pay</strong></td><td style="padding:8px 0 4px;border-top:1px solid #e5c9a0;text-align:right"><strong>${money(o.totalPrice)}</strong></td></tr>`;

const where = (o: PlacedOrder) =>
  o.method === 'delivery'
    ? `Delivered on ${o.day} to:\n${o.address}\n${o.postcode}`
    : `Collect on ${o.day}${o.site.address ? ` from ${o.site.address}` : ''}`;

const wrap = (body: string) =>
  `<div style="font-family:Inter,Arial,sans-serif;color:#b62632;background:#fe9907;padding:24px"><div style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;padding:24px 28px;line-height:1.5">${body}</div></div>`;

export function confirmationEmail(o: PlacedOrder) {
  const contact = [o.site.phone && `call ${o.site.phone}`, o.site.email && `email ${o.site.email}`].filter(Boolean).join(' or ');
  const pay = `Please pay ${money(o.totalPrice)} by cash or card when you ${o.method === 'delivery' ? 'receive your delivery' : 'collect'}.`;
  const change = `Need to change or cancel? ${contact ? `Just ${contact}` : 'Just reply to this email'} and quote ${o.reference}.`;
  return {
    subject: `Your takeaway order ${o.reference} for ${o.day}`,
    text: [
      `Hi ${o.name},`, '', `Thank you! We've got your takeaway order.`, '',
      `Order: ${o.reference}`, o.menu && `Menu: ${o.menu}`, '', itemsText(o), `Total to pay: ${money(o.totalPrice)}`, '',
      where(o), '', pay, '', change, '', o.site.name,
    ].filter((l) => typeof l === 'string').join('\n'),
    html: wrap(`
      <p>Hi ${esc(o.name)},</p>
      <p><strong>Thank you! We've got your takeaway order.</strong></p>
      <p style="margin:0">Order <strong>${o.reference}</strong>${o.menu ? `<br>${esc(o.menu)}` : ''}</p>
      <table style="border-collapse:collapse;margin:12px 0;width:100%">${itemsHtml(o)}</table>
      <p>${nl(where(o))}</p>
      <p>${esc(pay)}</p>
      <p>${esc(change)}</p>
      <p>${esc(o.site.name)}</p>`),
  };
}

export function staffEmail(o: PlacedOrder) {
  const rows: [string, string][] = [
    ['Name', o.name],
    ['Phone', o.phone],
    ['Email', o.email || '(none given)'],
    ['How', o.method === 'delivery' ? `Delivery to ${o.address}, ${o.postcode}` : 'Collection'],
    ['Notes', o.notes || '(none)'],
  ];
  return {
    subject: `New order ${o.reference}: ${o.name}, ${o.totalMeals} meal${o.totalMeals === 1 ? '' : 's'} (${o.method})`,
    text: [
      `New takeaway order for ${o.day}`, '', ...rows.map(([k, v]) => `${k}: ${v}`), '', itemsText(o), `Total to pay: ${money(o.totalPrice)}`, '',
      `See all orders: ${o.adminUrl}`,
    ].join('\n'),
    html: wrap(`
      <p><strong>New takeaway order ${o.reference}</strong> for ${esc(o.day)}</p>
      <table style="border-collapse:collapse;margin:12px 0">${rows.map(([k, v]) => `<tr><td style="padding:3px 12px 3px 0;vertical-align:top"><strong>${k}</strong></td><td style="padding:3px 0">${nl(v)}</td></tr>`).join('')}</table>
      <table style="border-collapse:collapse;margin:12px 0;width:100%">${itemsHtml(o)}</table>
      <p><a href="${esc(o.adminUrl)}" style="color:#b62632">See all orders in the editor</a></p>`),
  };
}
