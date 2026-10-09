// Supabase rows → planner Catalog. Pure mapping; loading lives in loadCatalog.

import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeName } from '../core/hotplate';
import type { Catalog, CookingMethod, MenuItem, Pack, Size } from '../core/planner';

export type CatalogRows = {
  ingredients: { id: string; name: string; yield: number; yield_source: 'usda' | 'kitchen'; buffer: number; purchase_unit: string | null; purchase_oz: number | null }[];
  kitchen_recipes: { id: string; name: string; method: CookingMethod | null; finished_oz: number | null }[];
  recipe_lines: { recipe_id: string; ingredient_id: string | null; raw_name: string; oz: number | null; position: number }[];
  container_types: { id: string; name: string; cost_only: boolean }[];
  menu_items: { id: string; name: string; kind: 'meal' | 'sidePlate'; side_oz: number | null }[];
  menu_titles: { menu_item_id: string; title: string }[];
  menu_sizes: { id: string; menu_item_id: string; variation: string; labels: number }[];
  size_portions: { size_id: string; recipe_id: string; oz: number }[];
  size_packaging: { size_id: string; container_id: string; qty: number }[];
  side_links: { side_name: string; recipe_id: string }[];
};

const num = (n: number | string | null) => (n === null ? null : Number(n));

function groupBy<T>(rows: T[], key: (r: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const r of rows) m.set(key(r), [...(m.get(key(r)) ?? []), r]);
  return m;
}

export function rowsToCatalog(rows: CatalogRows): Catalog {
  const containerName = new Map(rows.container_types.filter(c => !c.cost_only).map(c => [c.id, c.name]));
  const linesByRecipe = groupBy(rows.recipe_lines, l => l.recipe_id);
  const titlesByItem = groupBy(rows.menu_titles, t => t.menu_item_id);
  const sizesByItem = groupBy(rows.menu_sizes, s => s.menu_item_id);
  const portionsBySize = groupBy(rows.size_portions, p => p.size_id);
  const packsBySize = groupBy(rows.size_packaging, p => p.size_id);

  const packaging = (sizeId: string): Pack[] =>
    (packsBySize.get(sizeId) ?? []).flatMap(p => {
      const container = containerName.get(p.container_id);
      return container ? [{ container, qty: p.qty }] : [];
    });

  const menu: MenuItem[] = rows.menu_items.map(m => {
    const titles = [m.name, ...(titlesByItem.get(m.id) ?? []).map(t => t.title)];
    const sizes = sizesByItem.get(m.id) ?? [];
    if (m.kind === 'sidePlate') {
      const s = sizes.find(s => normalizeName(s.variation) === 'regular') ?? sizes[0];
      return { id: m.id, titles, kind: 'sidePlate', sideOz: num(m.side_oz) ?? 4, packaging: s ? packaging(s.id) : [], labels: s?.labels ?? 1 };
    }
    const bySize: Record<string, Size> = {};
    for (const s of sizes) {
      bySize[normalizeName(s.variation)] = {
        portions: (portionsBySize.get(s.id) ?? []).map(p => ({ recipeId: p.recipe_id, oz: Number(p.oz) })),
        packaging: packaging(s.id),
        labels: s.labels,
      };
    }
    return { id: m.id, titles, kind: 'meal', sizes: bySize };
  });

  return {
    ingredients: rows.ingredients.map(i => ({
      id: i.id,
      name: i.name,
      yield: Number(i.yield),
      yieldSource: i.yield_source,
      buffer: Number(i.buffer) || 0,
      ...(i.purchase_unit && i.purchase_oz ? { purchase: { unit: i.purchase_unit, oz: Number(i.purchase_oz) } } : {}),
    })),
    recipes: rows.kitchen_recipes.map(r => ({
      id: r.id,
      name: r.name,
      method: r.method ?? 'unassigned',
      ...(r.finished_oz ? { finishedOz: Number(r.finished_oz) } : {}),
      lines: (linesByRecipe.get(r.id) ?? [])
        .sort((a, b) => a.position - b.position)
        .map(l => ({ ingredientId: l.ingredient_id, name: l.raw_name, oz: num(l.oz) })),
    })),
    menu,
    sides: Object.fromEntries(rows.side_links.map(s => [s.side_name, s.recipe_id])),
  };
}

const TABLES = [
  'ingredients', 'kitchen_recipes', 'recipe_lines', 'container_types', 'menu_items',
  'menu_titles', 'menu_sizes', 'size_portions', 'size_packaging', 'side_links',
] as const satisfies readonly (keyof CatalogRows)[];

export async function loadCatalog(db: SupabaseClient, kitchenId: string): Promise<Catalog> {
  const results = await Promise.all(TABLES.map(t => db.from(t).select('*').eq('kitchen_id', kitchenId)));
  const rows = {} as Record<string, unknown[]>;
  results.forEach((r, i) => {
    if (r.error) throw new Error(`Loading ${TABLES[i]}: ${r.error.message}`);
    rows[TABLES[i]!] = r.data ?? [];
  });
  return rowsToCatalog(rows as CatalogRows);
}
