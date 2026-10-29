import { readFileSync } from 'node:fs';
import { parseHotplateCsv, type OrderLine } from '../src/core/hotplate';
import { containsOrders, isEarlierWeek, sameOrders, subtractOrders } from '../src/core/weeks';

const o = (item: string, quantity: number, variation = '', remaining = quantity): OrderLine =>
  ({ windowStart: '2026-10-09 00:00:00', item, variation, quantity, remaining });

describe('taking out a previous upload', () => {
  const lastWeek = [o('Shrimp & Grits', 5), o('Shrimp & Grits', 2, 'Family'), o('Pork Roast', 5)];
  const thisFile = [o('Shrimp & Grits ', 10), o('Shrimp & Grits', 2, 'Family'), o('Shrimp & Grits', 1, '6 OZ'), o('Pork Roast', 5), o('Meatloaf', 14)];

  it('detects that the new file still holds last week', () => {
    expect(containsOrders(thisFile, lastWeek)).toBe(true);
    expect(containsOrders(lastWeek, thisFile)).toBe(false);
    expect(sameOrders(lastWeek, [...lastWeek].reverse())).toBe(true);
  });

  it('leaves only this week', () => {
    expect(subtractOrders(thisFile, lastWeek).map(x => [x.item.trim(), x.variation, x.quantity])).toEqual([
      ['Shrimp & Grits', '', 5], ['Shrimp & Grits', '6 OZ', 1], ['Meatloaf', '', 14],
    ]);
  });

  it('counts what was already prepped against the earlier week first', () => {
    // 10 sold, 6 prepped (4 remaining); 5 were last week's → 5 this week, all 4 remaining are this week's.
    expect(subtractOrders([o('Shrimp', 10, '', 4)], [o('Shrimp', 5)])).toEqual([o('Shrimp', 5, '', 4)]);
    // 10 sold, 2 remaining; 5 last week → 5 this week but only 2 left to prep.
    expect(subtractOrders([o('Shrimp', 10, '', 2)], [o('Shrimp', 5)])[0]!.remaining).toBe(2);
  });

  it('matches the real files: 10-14 prep list minus 10-08', () => {
    const prev = parseHotplateCsv(readFileSync(new URL('./fixtures/hotplate-prep-list-2026-10-08.csv', import.meta.url), 'utf8'));
    const cur = parseHotplateCsv(readFileSync(new URL('./fixtures/hotplate-prep-list-2026-10-14.csv', import.meta.url), 'utf8'));
    expect(containsOrders(cur, prev)).toBe(true);
    const week = subtractOrders(cur, prev);
    const qty = (item: string, variation = '') => week.filter(x => x.item.trim() === item && x.variation.trim() === variation).reduce((s, x) => s + x.quantity, 0);
    expect(qty('Shrimp & Grits with Brussels sprouts')).toBe(5);
    expect(qty('Shrimp & Grits with Brussels sprouts', '6 OZ')).toBe(1);
    expect(qty('Smoked Beef by the pound')).toBe(1);
    expect(qty('Chicken veggie pasta')).toBe(0);
  });
});

describe('same week or last week', () => {
  const now = new Date('2026-10-29T13:00:00Z');
  it('an upload from earlier this week is the same week; 4+ days back is last week', () => {
    expect(isEarlierWeek('2026-10-28T20:00:00Z', now)).toBe(false);
    expect(isEarlierWeek('2026-10-22T15:00:00Z', now)).toBe(true);
  });
});
