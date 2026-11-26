// The two emails sent for each order (a confirmation to the customer and an alert to staff),
// plus the spreadsheet of all orders emailed to staff when orders close.
import { summaryLines, type Summary } from '../src/lib/order-sheet';
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
  /** Paid online with PayPal before the takeaway (otherwise they pay on collection or delivery). */
  paidOnline?: boolean;
  menu: string;
  day: string;
  site: { name: string; email: string; phone: string; address: string };
  adminUrl: string;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const nl = (s: string) => esc(s).replace(/\n/g, '<br>');

const itemsText = (o: PlacedOrder) => o.items.map((i) => `${i.quantity} × ${i.option} (${money(i.price)} each)`).join('\n');
const totalLabel = (o: PlacedOrder) => (o.paidOnline ? 'Total paid online' : 'Total to pay');

const itemsHtml = (o: PlacedOrder) =>
  o.items.map((i) => `<tr><td style="padding:4px 12px 4px 0">${i.quantity} × ${esc(i.option)}</td><td style="padding:4px 0;text-align:right">${money(i.quantity * i.price)}</td></tr>`).join('') +
  `<tr><td style="padding:8px 12px 4px 0;border-top:1px solid #e5c9a0"><strong>${totalLabel(o)}</strong></td><td style="padding:8px 0 4px;border-top:1px solid #e5c9a0;text-align:right"><strong>${money(o.totalPrice)}</strong></td></tr>`;

const where = (o: PlacedOrder) =>
  o.method === 'delivery'
    ? `Delivered on ${o.day} to:\n${o.address}\n${o.postcode}`
    : `Collect on ${o.day}${o.site.address ? ` from ${o.site.address}` : ''}`;

const wrap = (body: string) =>
  `<div style="font-family:Inter,Arial,sans-serif;color:#b62632;background:#fe9907;padding:24px"><div style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;padding:24px 28px;line-height:1.5">${body}</div></div>`;

export function confirmationEmail(o: PlacedOrder) {
  const contact = [o.site.phone && `call ${o.site.phone}`, o.site.email && `email ${o.site.email}`].filter(Boolean).join(' or ');
  const pay = o.paidOnline
    ? `You've paid ${money(o.totalPrice)} online, so there's nothing to pay when you ${o.method === 'delivery' ? 'receive your delivery' : 'collect'}.`
    : `Please pay ${money(o.totalPrice)} by cash or card when you ${o.method === 'delivery' ? 'receive your delivery' : 'collect'}.`;
  const change = `Need to change or cancel? ${contact ? `Just ${contact}` : 'Just reply to this email'} and quote ${o.reference}.`;
  return {
    subject: `Your takeaway order ${o.reference} for ${o.day}`,
    text: [
      `Hi ${o.name},`, '', `Thank you! We've got your takeaway order.`, '',
      `Order: ${o.reference}`, o.menu && `Menu: ${o.menu}`, '', itemsText(o), `${totalLabel(o)}: ${money(o.totalPrice)}`, '',
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
    ['Payment', o.paidOnline ? `Paid online (PayPal), ${money(o.totalPrice)}` : 'On collection / delivery'],
    ['Notes', o.notes || '(none)'],
  ];
  return {
    subject: `New order ${o.reference}: ${o.name}, ${o.totalMeals} meal${o.totalMeals === 1 ? '' : 's'} (${o.method}${o.paidOnline ? ', paid online' : ''})`,
    text: [
      `New takeaway order for ${o.day}`, '', ...rows.map(([k, v]) => `${k}: ${v}`), '', itemsText(o), `${totalLabel(o)}: ${money(o.totalPrice)}`, '',
      `See all orders: ${o.adminUrl}`,
    ].join('\n'),
    html: wrap(`
      <p><strong>New takeaway order ${o.reference}</strong> for ${esc(o.day)}</p>
      <table style="border-collapse:collapse;margin:12px 0">${rows.map(([k, v]) => `<tr><td style="padding:3px 12px 3px 0;vertical-align:top"><strong>${k}</strong></td><td style="padding:3px 0">${nl(v)}</td></tr>`).join('')}</table>
      <table style="border-collapse:collapse;margin:12px 0;width:100%">${itemsHtml(o)}</table>
      <p><a href="${esc(o.adminUrl)}" style="color:#b62632">See all orders in the editor</a></p>`),
  };
}

export function orderSheetEmail(o: { day: string; deadline: string; summary: Summary; siteName: string }) {
  const lines = summaryLines(o.summary);
  const intro = `Orders for ${o.day} closed on ${o.deadline}. The spreadsheet of all orders is attached (it opens in Excel or Google Sheets).`;
  const outro = 'Any changes made in the editor after this email (cancellations, phone orders) won\'t be in the attachment: download a fresh copy from Takeaway orders → Download spreadsheet in /admin.';
  return {
    subject: `Orders for ${o.day}: ${o.summary.meals} meal${o.summary.meals === 1 ? '' : 's'} from ${o.summary.orders} order${o.summary.orders === 1 ? '' : 's'}`,
    text: [intro, '', ...lines, '', outro, '', o.siteName].join('\n'),
    html: wrap(`
      <p>${esc(intro)}</p>
      <p style="margin:0"><strong>${esc(lines[0])}</strong></p>
      <ul style="padding-left:20px;margin:8px 0 12px">${lines.slice(1).map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
      <p style="font-size:14px">${esc(outro)}</p>
      <p>${esc(o.siteName)}</p>`),
  };
}
