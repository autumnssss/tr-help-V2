// Planner: Hotplate order lines + kitchen catalog → shopping list, prep sheet,
// label counts and container counts. Pure: no I/O. All weights are in ounces.

import { normalizeName, parseSidePicks, type OrderLine } from './hotplate';

export type CookingMethod =
  | 'smoke' | 'braise' | 'boil' | 'grill' | 'roast' | 'saute' | 'bake' | 'no-cook'
  /** Not set yet (e.g. imported from V1). Shows as its own prep-sheet group. */
  | 'unassigned';

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
  /**
   * As-purchased weight of each ingredient for one batch. `name` is what the recipe says.
   * Null ingredientId = not linked to the library yet; null oz = amount not convertible to weight yet.
   * A line with `recipeId` uses another recipe instead (e.g. Boiled Potatoes in Potato Salad):
   * its oz is that recipe's finished weight per batch.
   */
  lines: RecipeLine[];
  /** Measured finished batch weight. Absent = estimated from ingredient yields. */
  finishedOz?: number;
};

export type RecipeLine = { ingredientId: string | null; recipeId?: string; name?: string; oz: number | null };

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
  /** Line not linked to a library ingredient (or linked to one that's gone). */
  | { kind: 'ingredient'; recipeId: string; ingredient: string }
  /** Line amount has no weight yet, e.g. cups of an ingredient with no grams-per-cup. */
  | { kind: 'weight'; recipeId: string; ingredient: string }
  /** Recipes that use each other in a loop (A uses B uses A). */
  | { kind: 'cycle'; recipeId: string };

export type ShoppingLine = {
  ingredientId: string;
  name: string;
  oz: number;
  lb: number;
  /** Whole packages to buy, rounded up. Only when a purchase unit is set. */
  packages?: { count: number; unit: string };
};

export type PrepLine = {
  recipeId: string;
  name: string;
  finishedLb: number;
  /** For base recipes used inside other recipes: where the total goes, e.g. Potato Salad 5 lb, Mashed Potatoes 7 lb. */
  usedIn?: { name: string; lb: number }[];
};

/** Per-component totals for everything sold: portion counts → finished weight → what to buy. */
export type ComponentLine = {
  recipeId: string;
  name: string;
  method: CookingMethod;
  /** e.g. [{label:'4 oz', oz:4, count:6}, {label:'Family', oz:16, count:2}] */
  portions: { label: string; oz: number; count: number }[];
  finishedOz: number;
  finishedLb: number;
  /** As-purchased amounts for this component only. Empty until its recipe is fully set up. */
  buy: ShoppingLine[];
};

export type Plan = {
  complete: boolean;
  unresolved: Unresolved[];
  shoppingList: ShoppingLine[];
  components: ComponentLine[];
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
  return recipe.lines.reduce(
    // A sub-recipe line is already finished weight.
    (sum, l) => sum + (l.oz ?? 0) * (l.recipeId ? 1 : (l.ingredientId && ingredients.get(l.ingredientId)?.yield) || 0),
    0,
  );
}

function buyLine(ing: Ingredient, oz: number): ShoppingLine {
  const line: ShoppingLine = { ingredientId: ing.id, name: ing.name, oz: round2(oz), lb: round2(oz / 16) };
  if (ing.purchase) {
    // Tolerance so float noise (e.g. 2.0000001) doesn't add a package.
    line.packages = { count: Math.ceil(oz / ing.purchase.oz - 1e-9), unit: ing.purchase.unit };
  }
  return line;
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
  // recipeId → portion label → {oz, count}
  const portionCounts = new Map<string, Map<string, { oz: number; count: number }>>();
  const countPortion = (recipeId: string, label: string, oz: number, count: number) => {
    const byLabel = portionCounts.get(recipeId) ?? new Map<string, { oz: number; count: number }>();
    const key = `${label}|${oz}`;
    const cur = byLabel.get(key) ?? { oz, count: 0 };
    cur.count += count;
    byLabel.set(key, cur);
    portionCounts.set(recipeId, byLabel);
  };
  const labels = new Map<string, number>();
  const containers = new Map<string, number>();
  const add = (m: Map<string, number>, k: string, n: number) => m.set(k, (m.get(k) ?? 0) + n);

  for (const o of orders) {
    const item = byTitle.get(normalizeName(o.item));
    if (!item) { flag({ kind: 'item', title: o.item }); continue; }

    let portions: Portion[];
    let packaging: Pack[];
    let labelCount: number;
    let sizeLabel: (p: Portion) => string;
    let portionCount = o.quantity;

    if (item.kind === 'sidePlate') {
      const picks = parseSidePicks(o.variation);
      const missing = picks.filter(p => !sides.has(normalizeName(p.name)));
      if (missing.length) {
        missing.forEach(p => flag({ kind: 'side', title: o.item, side: p.name }));
        continue;
      }
      // Count each pick as its own side portion so "2x Broccoli" reads as 4 oz ×2.
      portions = picks.flatMap(p =>
        Array.from({ length: p.count }, () => ({ recipeId: sides.get(normalizeName(p.name))!, oz: item.sideOz })));
      packaging = item.packaging;
      labelCount = item.labels;
      sizeLabel = p => `${p.oz} oz`;
    } else {
      const key = sizeKey(o.variation, item.sizes);
      if (!key) { flag({ kind: 'size', title: o.item, variation: o.variation }); continue; }
      ({ portions, packaging, labels: labelCount } = item.sizes[key]!);
      sizeLabel = key.startsWith('family') ? () => 'Family' : p => `${p.oz} oz`;
    }

    for (const p of portions) {
      add(shopOz, p.recipeId, p.oz * o.quantity);
      add(prepOz, p.recipeId, p.oz * o.remaining);
      countPortion(p.recipeId, sizeLabel(p), p.oz, portionCount);
    }
    for (const pk of packaging) add(containers, pk.container, pk.qty * o.quantity);
    add(labels, item.titles[0] ?? o.item, labelCount * o.quantity);
  }

  // Push plate demand down into sub-recipes (Potato Salad → Boiled Potatoes).
  // usedIn: sub-recipe → parent recipe → finished oz it takes.
  const expand = (direct: Map<string, number>) => {
    const total = new Map<string, number>();
    const usedIn = new Map<string, Map<string, number>>();
    const visit = (recipeId: string, oz: number, path: string[]) => {
      add(total, recipeId, oz);
      const recipe = recipes.get(recipeId);
      const subs = recipe?.lines.filter(l => l.recipeId) ?? [];
      if (!recipe || !subs.length || oz <= 0) return;
      const batch = finishedBatchOz(recipe, ingredients);
      if (batch <= 0) return; // flagged when the recipe itself is checked
      for (const l of subs) {
        if (l.oz === null) continue; // flagged as 'weight'
        if (path.includes(l.recipeId!)) { flag({ kind: 'cycle', recipeId: l.recipeId! }); continue; }
        const childOz = (l.oz * oz) / batch;
        const parents = usedIn.get(l.recipeId!) ?? new Map<string, number>();
        add(parents, recipeId, childOz);
        usedIn.set(l.recipeId!, parents);
        visit(l.recipeId!, childOz, [...path, l.recipeId!]);
      }
    };
    for (const [recipeId, oz] of direct) visit(recipeId, oz, [recipeId]);
    return { total, usedIn };
  };
  const shop = expand(shopOz);
  const prep = expand(prepOz);

  // Finished oz per recipe → as-purchased oz per ingredient (each recipe's own ingredient lines).
  const buyOz = new Map<string, number>();
  const recipeBuy = new Map<string, Map<string, number>>(); // recipeId → ingredientId → oz
  for (const [recipeId, needOz] of shop.total) {
    const recipe = recipes.get(recipeId);
    if (!recipe) { flag({ kind: 'recipe', recipeId }); continue; }
    let ok = true;
    for (const l of recipe.lines) {
      if (l.recipeId) {
        if (!recipes.has(l.recipeId)) { flag({ kind: 'recipe', recipeId: l.recipeId }); ok = false; }
        else if (l.oz === null) { flag({ kind: 'weight', recipeId, ingredient: recipes.get(l.recipeId)!.name }); ok = false; }
        continue;
      }
      const ing = l.ingredientId ? ingredients.get(l.ingredientId) : undefined;
      const label = ing?.name ?? l.name ?? l.ingredientId ?? '?';
      if (!ing) { flag({ kind: 'ingredient', recipeId, ingredient: label }); ok = false; }
      else if (l.oz === null) { flag({ kind: 'weight', recipeId, ingredient: label }); ok = false; }
    }
    if (!ok) continue;
    const batch = finishedBatchOz(recipe, ingredients);
    if (batch <= 0) { flag({ kind: 'recipe', recipeId }); continue; }
    const multiplier = needOz / batch;
    const mine = new Map<string, number>();
    for (const l of recipe.lines) {
      if (l.recipeId) continue; // bought through the sub-recipe
      const ing = ingredients.get(l.ingredientId!)!;
      const oz = l.oz! * multiplier * (1 + (ing.buffer ?? 0));
      add(buyOz, ing.id, oz);
      add(mine, ing.id, oz);
    }
    recipeBuy.set(recipeId, mine);
  }

  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
  const shoppingList = [...buyOz].map(([id, oz]) => buyLine(ingredients.get(id)!, oz)).sort(byName);

  const components: ComponentLine[] = [...shop.total]
    .filter(([, oz]) => oz > 0)
    .map(([recipeId, oz]) => {
      const recipe = recipes.get(recipeId);
      return {
        recipeId,
        name: recipe?.name ?? recipeId,
        method: recipe?.method ?? 'unassigned',
        portions: [...(portionCounts.get(recipeId)?.entries() ?? [])]
          .map(([key, v]) => ({ label: key.split('|')[0]!, ...v }))
          .sort((a, b) => a.oz - b.oz),
        finishedOz: round2(oz),
        finishedLb: round2(oz / 16),
        buy: [...(recipeBuy.get(recipeId) ?? [])].map(([id, b]) => buyLine(ingredients.get(id)!, b)).sort(byName),
      };
    })
    .sort(byName);

  const methods = new Map<CookingMethod, PrepLine[]>();
  for (const [recipeId, oz] of prep.total) {
    const recipe = recipes.get(recipeId);
    if (!recipe || oz <= 0) continue;
    const list = methods.get(recipe.method) ?? [];
    const line: PrepLine = { recipeId, name: recipe.name, finishedLb: round2(oz / 16) };
    const parents = prep.usedIn.get(recipeId);
    if (parents) {
      const plated = prepOz.get(recipeId) ?? 0;
      line.usedIn = [
        ...[...parents].map(([id, pOz]) => ({ name: recipes.get(id)?.name ?? id, lb: round2(pOz / 16) })),
        ...(plated > 0 ? [{ name: 'Plated as is', lb: round2(plated / 16) }] : []),
      ].sort((a, b) => a.name.localeCompare(b.name));
    }
    list.push(line);
    methods.set(recipe.method, list);
  }
  const prepSheet = [...methods]
    .map(([method, items]) => ({ method, items: items.sort((a, b) => a.name.localeCompare(b.name)) }))
    .sort((a, b) => a.method.localeCompare(b.method));

  return {
    complete: unresolved.size === 0,
    unresolved: [...unresolved.values()],
    shoppingList,
    components,
    prepSheet,
    labels: [...labels].map(([title, count]) => ({ title, count })),
    containers: [...containers].map(([container, count]) => ({ container, count })).sort((a, b) => a.container.localeCompare(b.container)),
  };
}
