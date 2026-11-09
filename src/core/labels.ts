// Labels per item, split by where the order goes and by size, from the ticket PDF (kitchen 2026-10-21, 2026-11-09):
// Broccoli whatsit 12 → Reg 7 · 6 oz 2 · Family 1: size columns count ORDERS, Total counts LABELS (a Family order
// takes 3). Every ticket line is counted, on the menu or not: the size comes from the ticket's own wording.

import { normalizeName } from './hotplate';
import { DESTINATIONS, type Ticket } from './tickets';
import { sizeKey, type Catalog, type MenuItem } from './planner';

/** counts = orders per size column; total = labels. */
export type DestinationLabels = { destination: string; counts: Record<string, number>; total: number };
/** onMenu false: not set up in the app; labels per Family order are taken as FAMILY_LABELS. */
export type MealLabels = { title: string; total: number; onMenu: boolean; byDestination: DestinationLabels[] };
export type LabelsByDestination = {
  /** Column order: Reg, 6 oz, 8 oz (and any other oz size), Family. */
  columns: string[];
  meals: MealLabels[];
  /** Labels per destination across every item. */
  totals: { destination: string; total: number }[];
};

const BASE_COLUMNS = ['Reg', '6 oz', '8 oz'];
/** Labels for one Family order when the menu doesn't say otherwise. */
export const FAMILY_LABELS = 3;

/** The size column from the ticket's own wording: "6 OZ", "6 0z", "8 ounces", "Family Size feed 3-5"; anything else is Reg. */
export function sizeColumn(variation: string): string {
  const v = normalizeName(variation);
  if (v.startsWith('family')) return 'Family';
  const oz = v.match(/^(\d+(?:\.\d+)?)\s*(?:oz\.?|ounces?|0z)$/);
  return oz ? `${oz[1]} oz` : 'Reg'; // flavors, sides and other options are one regular label
}

const destinationRank = (d: string) => {
  const i = (DESTINATIONS as readonly string[]).indexOf(d);
  return i < 0 ? DESTINATIONS.length : i;
};

/** Labels for one order of this line: the menu's count for its size when the app knows it, else 1 (Family 3). */
function labelsPerOrder(item: MenuItem | undefined, variation: string, col: string): number {
  if (item?.kind === 'meal') {
    const key = sizeKey(variation, item.sizes);
    if (key !== undefined) return item.sizes[key]!.labels;
  } else if (item) return item.labels;
  return col === 'Family' ? FAMILY_LABELS : 1;
}

export function labelsByDestination(tickets: Ticket[], catalog?: Catalog): LabelsByDestination {
  const byTitle = new Map<string, MenuItem>();
  for (const m of catalog?.menu ?? []) for (const t of m.titles) byTitle.set(normalizeName(t), m);
  // Ticket fonts turn an emoji into a stray glyph or two ("Yummy COOKIES!! <j"): drop a short last word and retry.
  const stray = (n: string) => n.replace(/\s+\S{1,2}$/, '');
  const find = (title: string) => {
    const n = normalizeName(title);
    return byTitle.get(n) ?? byTitle.get(stray(n));
  };
  const cleanTitle = (title: string) => title.trim().replace(/\s+\S{0,1}[^\w\s&]\S{0,1}$/u, '').trim();

  const meals = new Map<string, { title: string; onMenu: boolean; dests: Map<string, { counts: Record<string, number>; labels: number }> }>();
  const extraOz = new Set<string>();
  for (const t of tickets) {
    for (const l of t.lines) {
      const item = find(l.item);
      const col = sizeColumn(l.variation);
      if (col.endsWith(' oz') && !BASE_COLUMNS.includes(col)) extraOz.add(col);
      const title = item?.titles[0] ?? cleanTitle(l.item);
      const key = normalizeName(title);
      const meal = meals.get(key) ?? { title, onMenu: !!item, dests: new Map() };
      const d = meal.dests.get(t.destination) ?? { counts: {}, labels: 0 };
      d.counts[col] = (d.counts[col] ?? 0) + l.quantity;
      d.labels += l.quantity * labelsPerOrder(item, l.variation, col);
      meal.dests.set(t.destination, d);
      meals.set(key, meal);
    }
  }

  const columns = [...BASE_COLUMNS, ...[...extraOz].sort((a, b) => parseFloat(a) - parseFloat(b)), 'Family'];
  const byDest = new Map<string, number>();
  const mealList: MealLabels[] = [...meals.values()]
    .map(({ title, onMenu, dests }) => {
      const byDestination = [...dests]
        .map(([destination, d]) => {
          byDest.set(destination, (byDest.get(destination) ?? 0) + d.labels);
          return { destination, counts: d.counts, total: d.labels };
        })
        .sort((a, b) => destinationRank(a.destination) - destinationRank(b.destination) || a.destination.localeCompare(b.destination));
      return { title, onMenu, total: byDestination.reduce((s, d) => s + d.total, 0), byDestination };
    })
    .sort((a, b) => a.title.localeCompare(b.title));

  return {
    columns,
    meals: mealList,
    totals: [...byDest]
      .map(([destination, total]) => ({ destination, total }))
      .sort((a, b) => destinationRank(a.destination) - destinationRank(b.destination) || a.destination.localeCompare(b.destination)),
  };
}
