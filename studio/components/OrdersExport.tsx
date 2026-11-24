// "Download orders spreadsheet" screen, under Takeaway orders in the Studio.
// Staff pick a takeaway Friday, see the meal totals, and download every order as a CSV that
// opens in Excel or Google Sheets. It runs in the signed-in staff member's browser, so the orders
// (which are private) never pass through a public web address.
import { DownloadIcon } from '@sanity/icons/Download';
import { RefreshIcon } from '@sanity/icons/Refresh';
import { Box, Button, Card, Flex, Select, Spinner, Stack, Text } from '@sanity/ui';
import { useCallback, useEffect, useState } from 'react';
import { useClient } from 'sanity';
import { formatDay, formatDeadline, schedule } from '../../src/lib/ordering';
import { csvFilename, ORDERS_QUERY, ordersCsv, summarise, summaryLines, type SheetOrder } from '../../src/lib/order-sheet';

const DATES_QUERY = `{
  "current": *[_id == "takeaway"][0]{ takeawayDate, orderBefore },
  "dates": array::unique(*[_type == "order" && defined(takeawayDate)].takeawayDate)
}`;

export function OrdersExport() {
  const client = useClient({ apiVersion: '2026-11-01' });
  const [dates, setDates] = useState<string[] | null>(null);
  const [current, setCurrent] = useState<{ takeawayDate?: string; orderBefore?: string } | null>(null);
  const [date, setDate] = useState('');
  const [orders, setOrders] = useState<SheetOrder[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    client
      .fetch<{ current: typeof current; dates: string[] }>(DATES_QUERY, {}, { perspective: 'drafts' })
      .then((r) => {
        const all = [...new Set([r.current?.takeawayDate, ...(r.dates ?? [])].filter((d): d is string => Boolean(d)))].sort().reverse();
        setCurrent(r.current);
        setDates(all);
        setDate((d) => d || r.current?.takeawayDate || all[0] || '');
      })
      .catch((e) => setError(String(e?.message ?? e)));
  }, [client]);

  const load = useCallback(() => {
    if (!date) return;
    setOrders(null);
    client
      .fetch<SheetOrder[]>(ORDERS_QUERY, { date }, { perspective: 'drafts' })
      .then(setOrders)
      .catch((e) => setError(String(e?.message ?? e)));
  }, [client, date]);
  useEffect(load, [load]);

  const download = () => {
    if (!orders) return;
    const blob = new Blob([ordersCsv(orders, date)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = csvFilename(date);
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const s = current?.takeawayDate === date ? schedule(current.takeawayDate, current.orderBefore) : null;
  const stillOpen = s?.cutoff && new Date(s.cutoff) > new Date();
  const sum = orders ? summarise(orders) : null;

  return (
    <Box padding={4} style={{ maxWidth: 640 }}>
      <Stack gap={5}>
        <Stack gap={3}>
          <Text size={3} weight="semibold">Download orders spreadsheet</Text>
          <Text muted size={1}>
            One row per order, with meal totals at the bottom. It opens in Excel or Google Sheets. Cancelled orders are
            listed but not counted in the totals. Staff are also emailed this spreadsheet automatically when orders close.
          </Text>
        </Stack>

        {error ? (
          <Card padding={3} tone="critical" radius={2} border>
            <Text size={1}>Sorry, the orders couldn't be loaded: {error}</Text>
          </Card>
        ) : !dates ? (
          <Spinner muted />
        ) : !dates.length ? (
          <Text>There are no orders yet.</Text>
        ) : (
          <>
            <Stack gap={2}>
              <Text size={1} weight="semibold">Takeaway Friday</Text>
              <Select value={date} onChange={(e) => setDate(e.currentTarget.value)}>
                {dates.map((d) => (
                  <option key={d} value={d}>
                    {formatDay(d)} {d.slice(0, 4)}
                    {d === current?.takeawayDate ? ' (this takeaway)' : ''}
                  </option>
                ))}
              </Select>
            </Stack>

            {stillOpen && (
              <Card padding={3} tone="caution" radius={2} border>
                <Text size={1}>Orders are still open until {formatDeadline(s!.cutoff)}, so more may come in.</Text>
              </Card>
            )}

            {!orders || !sum ? (
              <Spinner muted />
            ) : (
              <Card padding={4} radius={2} border>
                <Stack gap={3}>
                  {summaryLines(sum).map((line, i) => (
                    <Text key={i} weight={i === 0 ? 'semibold' : undefined}>{line}</Text>
                  ))}
                </Stack>
              </Card>
            )}

            <Flex gap={2}>
              <Button icon={DownloadIcon} text="Download spreadsheet" tone="primary" onClick={download} disabled={!orders?.length} />
              <Button icon={RefreshIcon} text="Refresh" mode="ghost" onClick={load} />
            </Flex>
          </>
        )}
      </Stack>
    </Box>
  );
}
