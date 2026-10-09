// Planner: Hotplate order lines + kitchen catalog → shopping list, prep sheet,
// label counts and container counts. Pure: no I/O. All weights are in ounces.

import { normalizeName, parseSidePicks, type OrderLine } from './hotplate';

export type CookingMethod =
  | 'smoke' | 'braise' | 'boil' | 'grill' | 'roast' | 'saute' | 'bake' | 'no-cook';

export type Ingredient = {
  id: string;
  name: string;
  /** As-purchased → plate-ready, all loss included (trim, peel, breakdown, cooking). 0.5 = 50%. Can exceed 1 (pasta, grits). */
  yield: number;
  yieldSource: 'usda' | 'kitchen';
  /** Extra safety margin for unpredictable items. 0.1 = 10%. */
  buffer?: number;
  /** How it's bought, e.g. { unit: 'rack', oz: 52 } or { unit: '2 lb bag', oz: 32 }. Absent = pounds. */
  purchase?: { unit: string; oz: number };
};

export type Recipe = {
  id: string;
  name: string;
  method: CookingMethod;
  /** As-purchased weight of each ingredient for one batch. */
  lines: { ingredientId: string; oz: number }[];
  /** Measured finished batch weight. Absent = estimated from ingredient yields. */
  finishedOz?: number;
};

/** Finished (plate-ready) oz of a recipe in one order. Cups use actual fill, not cup size. */
export type Portion = { recipeId: string; oz: number };
export type Pack = { container: string; qty: number };
export type Size = { portions: Portion[]; packaging: Pack[]; labels: number };

export type MenuItem = {
  id: string;
  /** Hotplate titles that mean this item (matched after normalizing). */
  titles: string[];
} & (
  | {
      kind: 'meal';
      /** Keyed by Hotplate variation text, normalized. 'regular' = blank variation, 'family' = any Family… variation without its own entry. */
      sizes: Record<string, Size>;
    }
  | {
      kind: 'sidePlate';
      /** Finished oz per side pick. */
      sideOz: number;
      packaging: Pack[];
      labels: number;
    }
);

export type Catalog = {
  ingredients: Ingredient[];
  recipes: Recipe[];
  menu: MenuItem[];
  /** Side names as they appear in side-plate variations → recipe id. */
  sides: Record<string, string>;
};

export type Unresolved =
  | { kind: 'item'; title: string }
  | { kind: 'size'; title: string; variation: string }
  | { kind: 'side'; title: string; side: string }
  | { kind: 'recipe'; recipeId: string }
  | { kind: 'ingredient'; recipeId: string; ingredientId: string };

export type ShoppingLine = {
  ingredientId: string;
  name: string;
  oz: number;
  lb: number;
  /** Whole packages to buy, rounded up. Only when a purchase unit is set. */
  packages?: { count: number; unit: string };
};

export type PrepLine = { recipeId: string; name: string; finishedLb: number };

export type Plan = {
  complete: boolean;
  unresolved: Unresolved[];
  shoppingList: ShoppingLine[];
  prepSheet: { method: CookingMethod; items: PrepLine[] }[];
  labels: { title: string; count: number }[];
  containers: { container: string; count: number }[];
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Regular 4/4/4 oz, family 16/16/16 oz. */
export function standardMeal(protein: string, starch: string, veg: string) {
  const parts = (oz: number) => [protein, starch, veg].map(recipeId => ({ recipeId, oz }));
  return { regular: parts(4), family: parts(16) };
}

/** Regular 8 oz entree + 4 oz veg, family 16 + 16 oz. */
export function casseroleMeal(entree: string, veg: string) {
  return {
    regular: [{ recipeId: entree, oz: 8 }, { recipeId: veg, oz: 4 }],
    family: [{ recipeId: entree, oz: 16 }, { recipeId: veg, oz: 16 }],
  };
}

export function finishedBatchOz(recipe: Recipe, ingredients: Map<string, Ingredient>): number {
  if (recipe.finishedOz) return recipe.finishedOz;
  return recipe.lines.reduce((sum, l) => sum + l.oz * (ingredients.get(l.ingredientId)?.yield ?? 0), 0);
}

function sizeKey(variation: string, sizes: Record<string, Size>): string | undefined {
  const v = normalizeName(variation);
  if (v === '') return sizes.regular ? 'regular' : undefined;
  if (sizes[v]) return v;
  if (v.startsWith('family') && sizes.family) return 'family';
  return undefined;
}

export function plan(orders: OrderLine[], catalog: Catalog): Plan {
  const ingredients = new Map(catalog.ingredients.map(i => [i.id, i]));
  const recipes = new Map(catalog.recipes.map(r => [r.id, r]));
  const byTitle = new Map<string, MenuItem>();
  for (const m of catalog.menu) for (const t of m.titles) byTitle.set(normalizeName(t), m);
  const sides = new Map(Object.entries(catalog.sides).map(([k, v]) => [normalizeName(k), v]));

  const unresolved = new Map<string, Unresolved>();
  const flag = (u: Unresolved) => unresolved.set(JSON.stringify(u), u);

  const shopOz = new Map<string, number>(); // recipeId → finished oz to buy for (Quantity)
  const prepOz = new Map<string, number>(); // recipeId → finished oz still to prep (Remaining)
  const labels = new Map<string, number>();
  const containers = new Map<string, number>();
  const add = (m: Map<string, number>, k: string, n: number) => m.set(k, (m.get(k) ?? 0) + n);

  for (const o of orders) {
    const item = byTitle.get(normalizeName(o.item));
    if (!item) { flag({ kind: 'item', title: o.item }); continue; }

    let portions: Portion[];
    let packaging: Pack[];
    let labelCount: number;

    if (item.kind === 'sidePlate') {
      const picks = parseSidePicks(o.variation);
      const missing = picks.filter(p => !sides.has(normalizeName(p.name)));
      if (missing.length) {
        missing.forEach(p => flag({ kind: 'side', title: o.item, side: p.name }));
        continue;
      }
      portions = picks.map(p => ({ recipeId: sides.get(normalizeName(p.name))!, oz: item.sideOz * p.count }));
      packaging = item.packaging;
      labelCount = item.labels;
    } else {
      const key = sizeKey(o.variation, item.sizes);
      if (!key) { flag({ kind: 'size', title: o.item, variation: o.variation }); continue; }
      ({ portions, packaging, labels: labelCount } = item.sizes[key]!);
    }

    for (const p of portions) {
      add(shopOz, p.recipeId, p.oz * o.quantity);
      add(prepOz, p.recipeId, p.oz * o.remaining);
    }
    for (const pk of packaging) add(containers, pk.container, pk.qty * o.quantity);
    add(labels, item.titles[0] ?? o.item, labelCount * o.quantity);
  }

  // Finished oz per recipe → as-purchased oz per ingredient.
  const buyOz = new Map<string, number>();
  for (const [recipeId, needOz] of shopOz) {
    const recipe = recipes.get(recipeId);
    if (!recipe) { flag({ kind: 'recipe', recipeId }); continue; }
    const bad = recipe.lines.filter(l => !ingredients.has(l.ingredientId));
    if (bad.length) {
      bad.forEach(l => flag({ kind: 'ingredient', recipeId, ingredientId: l.ingredientId }));
      continue;
    }
    const batch = finishedBatchOz(recipe, ingredients);
    if (batch <= 0) { flag({ kind: 'recipe', recipeId }); continue; }
    const multiplier = needOz / batch;
    for (const l of recipe.lines) {
      const ing = ingredients.get(l.ingredientId)!;
      add(buyOz, ing.id, l.oz * multiplier * (1 + (ing.buffer ?? 0)));
    }
  }

  const shoppingList: ShoppingLine[] = [...buyOz]
    .map(([id, oz]) => {
      const ing = ingredients.get(id)!;
      const line: ShoppingLine = { ingredientId: id, name: ing.name, oz: round2(oz), lb: round2(oz / 16) };
      if (ing.purchase) {
        // Tolerance so float noise (e.g. 2.0000001) doesn't add a package.
        line.packages = { count: Math.ceil(oz / ing.purchase.oz - 1e-9), unit: ing.purchase.unit };
      }
      return line;
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const methods = new Map<CookingMethod, PrepLine[]>();
  for (const [recipeId, oz] of prepOz) {
    const recipe = recipes.get(recipeId);
    if (!recipe || oz <= 0) continue;
    const list = methods.get(recipe.method) ?? [];
    list.push({ recipeId, name: recipe.name, finishedLb: round2(oz / 16) });
    methods.set(recipe.method, list);
  }
  const prepSheet = [...methods]
    .map(([method, items]) => ({ method, items: items.sort((a, b) => a.name.localeCompare(b.name)) }))
    .sort((a, b) => a.method.localeCompare(b.method));

  return {
    complete: unresolved.size === 0,
    unresolved: [...unresolved.values()],
    shoppingList,
    prepSheet,
    labels: [...labels].map(([title, count]) => ({ title, count })),
    containers: [...containers].map(([container, count]) => ({ container, count })).sort((a, b) => a.container.localeCompare(b.container)),
  };
}
