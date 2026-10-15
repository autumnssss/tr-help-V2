// Hotplate prep lists can carry earlier weeks' orders with the same window date.
// These helpers take out a previous upload so each week is counted once. Pure: no I/O.

import { normalizeName, type OrderLine } from './hotplate';

const key = (o: Pick<OrderLine, 'item' | 'variation'>) => `${normalizeName(o.item)}|${normalizeName(o.variation)}`;

function totals(lines: OrderLine[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const o of lines) m.set(key(o), (m.get(key(o)) ?? 0) + o.quantity);
  return m;
}

/** Same items, variations and quantities. */
export function sameOrders(a: OrderLine[], b: OrderLine[]): boolean {
  const ta = totals(a), tb = totals(b);
  return ta.size === tb.size && [...ta].every(([k, q]) => tb.get(k) === q);
}

/** Every line of `previous` is in `current` with at least the same quantity. */
export function containsOrders(current: OrderLine[], previous: OrderLine[]): boolean {
  const tc = totals(current);
  return previous.length > 0 && [...totals(previous)].every(([k, q]) => (tc.get(k) ?? 0) >= q);
}

/**
 * current − previous, per item + variation. Quantity drops by the previous quantity; whatever was
 * already prepped is counted against the earlier week first, so Remaining is capped at the new Quantity.
 */
export function subtractOrders(current: OrderLine[], previous: OrderLine[]): OrderLine[] {
  const left = totals(previous);
  return current.flatMap(o => {
    const k = key(o);
    const take = Math.min(o.quantity, left.get(k) ?? 0);
    left.set(k, (left.get(k) ?? 0) - take);
    const quantity = o.quantity - take;
    return quantity > 0 ? [{ ...o, quantity, remaining: Math.min(o.remaining, quantity) }] : [];
  });
}
