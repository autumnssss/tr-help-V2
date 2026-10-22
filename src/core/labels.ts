// Labels per meal, split by where the order goes and by size, from the ticket PDF (kitchen 2026-10-21):
// Meatloaf 38 → Bounce & Play: Reg 6 · 6 oz 1 · 8 oz 0 · Family 3 (Family = labels, not orders).

import { normalizeName } from './hotplate';
import { DESTINATIONS, type Ticket } from './tickets';
import { sizeKey, type Catalog, type MenuItem } from './planner';

export type DestinationLabels = { destination: string; counts: Record<string, number>; total: number };
export type MealLabels = { title: string; total: number; byDestination: DestinationLabels[] };
export type LabelsByDestination = {
  /** Column order: Reg, 6 oz, 8 oz (and any other oz size), Family. */
  columns: string[];
  meals: MealLabels[];
  /** Labels per destination across every meal. */
  totals: { destination: string; total: number }[];
  /** Ticket lines the menu doesn't know (item, or its size). */
  unmatched: { ticket: string; item: string; variation: string }[];
};

const BASE_COLUMNS = ['Reg', '6 oz', '8 oz'];

function column(item: MenuItem, variation: string): string | undefined {
  if (item.kind !== 'meal') return 'Reg';
  const key = sizeKey(variation, item.sizes);
  if (key === undefined) return undefined;
  if (key.startsWith('family')) return 'Family';
  const oz = key.match(/^(\d+(?:\.\d+)?)\s*[o0]z$/);
  return oz ? `${oz[1]} oz` : 'Reg'; // flavors and other options are regular plates
}

const destinationRank = (d: string) => {
  const i = (DESTINATIONS as readonly string[]).indexOf(d);
  return i < 0 ? DESTINATIONS.length : i;
};

export function labelsByDestination(tickets: Ticket[], catalog: Catalog): LabelsByDestination {
  const byTitle = new Map<string, MenuItem>();
  for (const m of catalog.menu) for (const t of m.titles) byTitle.set(normalizeName(t), m);
  // Ticket fonts turn an emoji into a stray glyph or two ("Yummy COOKIES!! <j"): drop a short last word and retry.
  const find = (title: string) => {
    const n = normalizeName(title);
    return byTitle.get(n) ?? byTitle.get(n.replace(/\s+\S{1,2}$/, ''));
  };

  const meals = new Map<string, Map<string, Record<string, number>>>(); // title → destination → column → labels
  const unmatched: LabelsByDestination['unmatched'] = [];
  const extraOz = new Set<string>();
  for (const t of tickets) {
    for (const l of t.lines) {
      const item = find(l.item);
      const col = item && column(item, l.variation);
      if (!item || !col) { unmatched.push({ ticket: t.number, item: l.item, variation: l.variation }); continue; }
      const perPlate = item.kind === 'meal' ? item.sizes[sizeKey(l.variation, item.sizes)!]!.labels : item.labels;
      if (col.endsWith(' oz') && !BASE_COLUMNS.includes(col)) extraOz.add(col);
      const title = item.titles[0] ?? l.item;
      const dests = meals.get(title) ?? new Map<string, Record<string, number>>();
      const counts = dests.get(t.destination) ?? {};
      counts[col] = (counts[col] ?? 0) + l.quantity * perPlate;
      dests.set(t.destination, counts);
      meals.set(title, dests);
    }
  }

  const columns = [...BASE_COLUMNS, ...[...extraOz].sort((a, b) => parseFloat(a) - parseFloat(b)), 'Family'];
  const sum = (c: Record<string, number>) => Object.values(c).reduce((s, n) => s + n, 0);
  const byDest = new Map<string, number>();
  const mealList: MealLabels[] = [...meals]
    .map(([title, dests]) => {
      const byDestination = [...dests]
        .map(([destination, counts]) => {
          byDest.set(destination, (byDest.get(destination) ?? 0) + sum(counts));
          return { destination, counts, total: sum(counts) };
        })
        .sort((a, b) => destinationRank(a.destination) - destinationRank(b.destination) || a.destination.localeCompare(b.destination));
      return { title, total: byDestination.reduce((s, d) => s + d.total, 0), byDestination };
    })
    .sort((a, b) => a.title.localeCompare(b.title));

  return {
    columns,
    meals: mealList,
    totals: [...byDest]
      .map(([destination, total]) => ({ destination, total }))
      .sort((a, b) => destinationRank(a.destination) - destinationRank(b.destination) || a.destination.localeCompare(b.destination)),
    unmatched,
  };
}
