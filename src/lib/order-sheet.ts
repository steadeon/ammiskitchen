// Turns a takeaway's orders into a spreadsheet (CSV) with one row per order and meal totals
// underneath. Shared by the "Download orders" screen in the Studio (/admin) and the Worker's
// email to staff when orders close (worker/index.ts), so both give exactly the same sheet.
import { formatDay, money, TIME_ZONE } from './ordering';

export interface SheetOrder {
  reference?: string;
  status?: string;
  paid?: boolean;
  name?: string;
  phone?: string;
  email?: string;
  method?: string;
  address?: string;
  postcode?: string;
  items?: { option?: string; quantity?: number; price?: number }[];
  totalMeals?: number;
  totalPrice?: number;
  notes?: string;
  staffNotes?: string;
  submittedAt?: string;
}

/**
 * The GROQ query for one takeaway's orders ($date = the takeaway Friday). Run it with the
 * "drafts" perspective so staff edits (status, paid, notes) count even before they're published.
 */
export const ORDERS_QUERY = `*[_type == "order" && takeawayDate == $date] | order(submittedAt asc) {
  reference, status, paid, name, phone, email, method, address, postcode,
  items[]{ option, quantity, price }, totalMeals, totalPrice, notes, staffNotes, submittedAt
}`;

const STATUS: Record<string, string> = { new: 'New', packed: 'Packed', done: 'Collected / delivered', cancelled: 'Cancelled' };

export const isCancelled = (o: SheetOrder) => o.status === 'cancelled';
const mealsIn = (o: SheetOrder) => (o.items ?? []).reduce((n, i) => n + (Number(i.quantity) || 0), 0);
const priceOf = (o: SheetOrder) =>
  o.totalPrice ?? (o.items ?? []).reduce((n, i) => n + (Number(i.quantity) || 0) * (Number(i.price) || 0), 0);

export interface Summary {
  /** Orders that count (everything except cancelled). */
  orders: number;
  cancelled: number;
  collection: number;
  delivery: number;
  meals: number;
  price: number;
  /** Meals of each option, in the order they first appear. */
  perOption: { option: string; quantity: number }[];
}

/** Totals for the orders that aren't cancelled. */
export function summarise(orders: SheetOrder[]): Summary {
  const live = orders.filter((o) => !isCancelled(o));
  const perOption = new Map<string, number>();
  for (const o of orders) for (const i of o.items ?? []) if (i.option && !perOption.has(i.option)) perOption.set(i.option, 0);
  for (const o of live) for (const i of o.items ?? []) if (i.option) perOption.set(i.option, perOption.get(i.option)! + (Number(i.quantity) || 0));
  return {
    orders: live.length,
    cancelled: orders.length - live.length,
    collection: live.filter((o) => o.method !== 'delivery').length,
    delivery: live.filter((o) => o.method === 'delivery').length,
    meals: live.reduce((n, o) => n + mealsIn(o), 0),
    price: Math.round(live.reduce((n, o) => n + priceOf(o), 0) * 100) / 100,
    perOption: [...perOption].map(([option, quantity]) => ({ option, quantity })),
  };
}

// ---- CSV ------------------------------------------------------------------------------

type Cell = string | number | null | undefined;

/** Phone numbers as text, so Excel keeps the leading 0 (only for values that are plainly a phone number). */
const phoneCell = (phone?: string) => (phone && /^[0-9+()\-\s]{7,30}$/.test(phone) ? `="${phone}"` : phone);

/**
 * One CSV cell. Text typed by the public can't start a formula when the sheet is opened in Excel
 * or Google Sheets (a leading = + - @ gets an apostrophe in front).
 */
function cell(v: Cell, formula = false): string {
  if (v == null) return '';
  if (typeof v === 'number') return String(v);
  let s = String(v);
  if (!formula && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const row = (cells: Cell[], formulaCols: number[] = []) => cells.map((c, i) => cell(c, formulaCols.includes(i))).join(',');

const londonDateTime = (iso?: string) =>
  iso ? new Date(iso).toLocaleString('en-GB', { timeZone: TIME_ZONE, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(',', '') : '';

/** The spreadsheet as CSV text (with a byte-order mark so Excel shows £ properly). */
export function ordersCsv(orders: SheetOrder[], takeawayDate: string): string {
  const sum = summarise(orders);
  const options = sum.perOption.map((p) => p.option);
  const qty = (o: SheetOrder, option: string) => (o.items ?? []).filter((i) => i.option === option).reduce((n, i) => n + (Number(i.quantity) || 0), 0) || '';
  const header = [
    'Reference', 'Status', 'Paid', 'Name', 'Phone', 'Email', 'Collection or delivery', 'Delivery address', 'Postcode',
    ...options, 'Total meals', 'Total to pay (£)', "Customer's notes", 'Staff notes', 'Ordered at',
  ];
  const phoneCol = 4;
  const lines = [
    row([`Takeaway orders for ${takeawayDate ? formatDay(takeawayDate) : 'unknown date'}`]),
    row(header),
    ...orders.map((o) =>
      row(
        [
          o.reference, STATUS[o.status ?? ''] ?? o.status ?? '', o.paid ? 'Yes' : 'No', o.name, phoneCell(o.phone), o.email,
          o.method === 'delivery' ? 'Delivery' : 'Collection', o.method === 'delivery' ? (o.address ?? '').replace(/\s*\n\s*/g, ', ') : '',
          o.method === 'delivery' ? o.postcode : '',
          ...options.map((opt) => qty(o, opt)), mealsIn(o), priceOf(o).toFixed(2), o.notes, o.staffNotes, londonDateTime(o.submittedAt),
        ],
        phoneCell(o.phone)?.startsWith('="') ? [phoneCol] : [],
      ),
    ),
    '',
    row([
      `TOTALS (${sum.orders} order${sum.orders === 1 ? '' : 's'}${sum.cancelled ? `, not counting ${sum.cancelled} cancelled` : ''})`,
      '', '', '', '', '', `${sum.collection} collection, ${sum.delivery} delivery`, '', '',
      ...sum.perOption.map((p) => p.quantity), sum.meals, sum.price.toFixed(2),
    ]),
  ];
  return '﻿' + lines.join('\r\n') + '\r\n';
}

export const csvFilename = (takeawayDate: string) => `ammis-kitchen-orders-${takeawayDate || 'undated'}.csv`;

/** A few plain lines summing up the takeaway, for the email and the Studio screen. */
export function summaryLines(sum: Summary): string[] {
  return [
    `${sum.orders} order${sum.orders === 1 ? '' : 's'} (${sum.collection} collection, ${sum.delivery} delivery)${sum.cancelled ? `, plus ${sum.cancelled} cancelled` : ''}`,
    ...sum.perOption.filter((p) => p.quantity).map((p) => `${p.quantity} × ${p.option}`),
    `${sum.meals} meal${sum.meals === 1 ? '' : 's'} in total, ${money(sum.price)} to collect`,
  ];
}
