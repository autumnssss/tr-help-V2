// Planner: Hotplate order lines + kitchen catalog → shopping list, prep sheet,
// label counts and container counts. Pure: no I/O. All weights are in ounces.

import { normalizeName, parseSidePicks, type OrderLine } from './hotplate';

export type CookingMethod =
  | 'smoke' | 'braise' | 'boil' | 'simmer' | 'grill' | 'roast' | 'saute' | 'bake' | 'no-cook'
  /** Not set yet (e.g. imported from V1). Shows as its own prep-sheet group. */
  | 'unassigned';

export type Ingredient = {
  id: string;
  name: string;
  /** As-purchased → plate-ready, all loss included (trim, peel, breakdown, cooking). 0.5 = 50%. Can exceed 1 (pasta, grits). */
  yield: number;
  /** usda = Handbook 102, kitchen = measured here, estimate = a placeholder until one of those exists. */
  yieldSource: 'usda' | 'kitchen' | 'estimate';
  /** Extra safety margin for unpredictable items. 0.1 = 10%. */
  buffer?: number;
  /** Counted, not weighed, on the shopping list: { unit: 'eggs', oz: 1.75 } → "7 eggs". Absent = oz/lb. */
  purchase?: { unit: string; oz: number };
  /** Always on hand (salt, butter, BBQ sauce): kept off the shopping list, shown under pantry. */
  staple?: boolean;
  /** Store section, e.g. 'Produce', 'Meat & Seafood'. Shopping list is grouped in STORE_ORDER. */
  category?: string;
  /** Weight of 1 cup (prepped) and of 1 each, entered by the kitchen; used to turn recipe amounts into weight. */
  gramsPerCup?: number;
  gramsPerEach?: number;
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
  /** Finished batch weight. Absent = estimated from ingredient yields. */
  finishedOz?: number;
  /** finishedOz was weighed in this kitchen (not an estimate). */
  finishedOzMeasured?: boolean;
  /** Finished oz of one piece, for portions counted in pieces (9 shrimp, 2 cracker packs). */
  ozPerPiece?: number;
  /** Groups lines within a station that share a pot or water, e.g. 'Salted water'. */
  prepGroup?: string;
  /** False for things mixed into another dish on the spot (broth from base): no prep line of its own. */
  onPrepSheet?: boolean;
  steps?: string;
  notes?: string;
  /** Made by count: one batch makes yieldCount yieldUnit (12 treats, 5 loaves). Scaled by how many you need. */
  yieldCount?: number;
  yieldUnit?: string;
};

/** Stations in the order the prep sheet shows them. */
export const STATION_ORDER: CookingMethod[] = ['smoke', 'bake', 'roast', 'braise', 'boil', 'simmer', 'saute', 'grill', 'no-cook', 'unassigned'];

export type RecipeLine = {
  ingredientId: string | null;
  recipeId?: string;
  name?: string;
  oz: number | null;
  /** As written in the recipe, e.g. 0.75 'cup' (used for scaled recipe cards). */
  amount?: number | null;
  unit?: string;
  /** e.g. 'diced', 'optional'. */
  note?: string;
};

/** A recipe multiplied to what's still to prep: batches = cooked oz needed ÷ cooked oz per batch. */
export type RecipeCard = {
  recipeId: string;
  name: string;
  batches: number;
  /** Cooked weight of these batches; null when the recipe's batch weight isn't known yet. */
  finishedOz: number | null;
  steps?: string;
  notes?: string;
  /** recipeId = a sub-recipe line; mixedIn = that sub-recipe has no prep line of its own (show it inside this card). */
  lines: {
    name: string; amount: number | null; unit: string; oz: number | null; recipeId?: string; mixedIn?: boolean;
    /** For mixed-in sub-recipes: that recipe scaled to just this line (this dish's share). */
    sub?: RecipeCard;
  }[];
};

/** Finished (plate-ready) oz of a recipe in one order. Cups use actual fill, not cup size. */
export type Portion = { recipeId: string; oz: number; pieces?: undefined } | { recipeId: string; pieces: number; oz?: undefined };
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
  | {
      /** Made but not shopped for here (Artisan Sweets): counted by variation on the prep list only. */
      kind: 'prepOnly';
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
  | { kind: 'cycle'; recipeId: string }
  /** Portion counted in pieces but the recipe has no weight per piece. */
  | { kind: 'pieces'; recipeId: string }
  /** Needed this order but has no station, so it would be on no station's list. */
  | { kind: 'station'; recipeId: string; lb: number };

/** Shopping list sections in the order you walk the store; anything else goes last. */
export const STORE_ORDER = ['Produce', 'Meat & Seafood', 'Deli', 'Dairy & Eggs', 'Bakery', 'Frozen', 'Canned & Dry', 'Sauces & Condiments'];

export type ShoppingLine = {
  ingredientId: string;
  name: string;
  category: string;
  oz: number;
  lb: number;
  /** Whole packages to buy, rounded up. Only when a purchase unit is set. */
  packages?: { count: number; unit: string };
};

export type PrepLine = {
  recipeId: string;
  name: string;
  finishedLb: number;
  /** What it's for: the dishes it's plated in (short menu names) and the recipes it goes into. */
  for: string[];
  /**
   * Dishes at the same station made from this one (Mashed Potatoes from Boiled Potatoes): they have no
   * line of their own, so they show under it. lb = the dish's own total.
   */
  nested?: { recipeId: string; name: string; lb: number; for: string[] }[];
  /** Pieces to plate, for portions counted in pieces (part of finishedLb). */
  pieces?: number;
  /** Shared pot or water within the station (Recipe.prepGroup). */
  group?: string;
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
  /** Staples this order uses: not on the shopping list, shown so stock can be checked. */
  pantry: ShoppingLine[];
  /** Every recipe still to prep, scaled to this order (Remaining). Keyed by recipe id. */
  recipeCards: Record<string, RecipeCard>;
  /** Prep-only items (Artisan Sweets) still to make, by variation. */
  prepOnly: { title: string; variation: string; count: number }[];
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

/** A recipe × batches, every line in its own units. Mixed-in sub-recipes get a card for this line's share. */
function buildCard(recipe: Recipe, batches: number, recipes: Map<string, Recipe>, ingredients: Map<string, Ingredient>, depth = 0): RecipeCard {
  const batch = finishedBatchOz(recipe, ingredients);
  return {
    recipeId: recipe.id,
    name: recipe.name,
    batches: round2(batches),
    finishedOz: batch > 0 ? round2(batch * batches) : null,
    ...(recipe.steps ? { steps: recipe.steps } : {}),
    ...(recipe.notes ? { notes: recipe.notes } : {}),
    lines: recipe.lines.map(l => {
      const sub = l.recipeId ? recipes.get(l.recipeId) : undefined;
      const mixedIn = sub?.onPrepSheet === false;
      const subBatch = sub ? finishedBatchOz(sub, ingredients) : 0;
      const subCard = mixedIn && l.oz != null && subBatch > 0 && depth < 5
        ? buildCard(sub!, (l.oz * batches) / subBatch, recipes, ingredients, depth + 1) : undefined;
      return {
        name: sub?.name ?? l.name ?? ingredients.get(l.ingredientId ?? '')?.name ?? '?',
        amount: l.amount != null ? l.amount * batches : null,
        unit: l.unit ?? '',
        oz: l.oz != null ? round2(l.oz * batches) : null,
        ...(sub ? { recipeId: sub.id } : {}),
        ...(mixedIn ? { mixedIn: true } : {}),
        ...(subCard ? { sub: subCard } : {}),
      };
    }),
  };
}

/** Any recipe on its own, scaled to a number of batches (Recipes screen). */
export function recipeCard(catalog: Catalog, recipeId: string, batches: number): RecipeCard | undefined {
  const recipes = new Map(catalog.recipes.map(r => [r.id, r]));
  const ingredients = new Map(catalog.ingredients.map(i => [i.id, i]));
  const recipe = recipes.get(recipeId);
  return recipe ? buildCard(recipe, batches, recipes, ingredients) : undefined;
}

/**
 * One serving of a recipe as sold: its portion in the menu's regular size (pieces × oz per piece for
 * counted portions). Falls back to the most common portion, then 4 oz.
 */
export function defaultServingOz(catalog: Catalog, recipeId: string): number {
  const recipe = catalog.recipes.find(r => r.id === recipeId);
  const ozOf = (p: Portion) => p.oz ?? (p.pieces && recipe?.ozPerPiece ? p.pieces * recipe.ozPerPiece : undefined);
  const regular: number[] = [];
  const any: number[] = [];
  for (const m of catalog.menu) {
    if (m.kind !== 'meal') continue;
    for (const [key, size] of Object.entries(m.sizes)) {
      for (const p of size.portions) {
        if (p.recipeId !== recipeId) continue;
        const oz = ozOf(p);
        if (oz === undefined) continue;
        (key === 'regular' ? regular : any).push(oz);
      }
    }
  }
  const pick = regular.length ? regular : any;
  if (!pick.length) return 4;
  const counts = new Map<number, number>();
  for (const oz of pick) counts.set(oz, (counts.get(oz) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]![0];
}

/**
 * True while a recipe's batch weight rests on estimates: any ingredient yield (or sub-recipe) not
 * measured in this kitchen, or a finished weight not yet weighed. Pad servings until it's confirmed.
 */
export function batchIsEstimate(catalog: Catalog, recipeId: string, seen = new Set<string>()): boolean {
  const recipe = catalog.recipes.find(r => r.id === recipeId);
  if (!recipe || seen.has(recipeId)) return true;
  seen.add(recipeId);
  if (recipe.finishedOz) return !recipe.finishedOzMeasured;
  return recipe.lines.some(l => l.recipeId
    ? batchIsEstimate(catalog, l.recipeId, seen)
    : catalog.ingredients.find(i => i.id === l.ingredientId)?.yieldSource !== 'kitchen');
}

/** Cooked oz of one batch, or 0 if not known yet (Recipes screen: "make N lb" → batches). */
export function batchOz(catalog: Catalog, recipeId: string): number {
  const recipe = catalog.recipes.find(r => r.id === recipeId);
  return recipe ? finishedBatchOz(recipe, new Map(catalog.ingredients.map(i => [i.id, i]))) : 0;
}

function buyLine(ing: Ingredient, oz: number): ShoppingLine {
  const line: ShoppingLine = { ingredientId: ing.id, name: ing.name, category: ing.category ?? 'Other', oz: round2(oz), lb: round2(oz / 16) };
  if (ing.purchase) {
    // Tolerance so float noise (e.g. 2.0000001) doesn't add a package.
    line.packages = { count: Math.ceil(oz / ing.purchase.oz - 1e-9), unit: ing.purchase.unit };
  }
  return line;
}

/** Short dish name for "for …": the menu title up to " with " (Carnitas with Elote… → Carnitas). */
export function dishName(title: string): string {
  return title.trim().split(/\s+with\s+/i)[0]!.trim();
}

/** Which of a meal's sizes a Hotplate variation is ('regular', 'family', '6 oz', a flavor…), if any. */
export function sizeKey(variation: string, sizes: Record<string, Size>): string | undefined {
  const v = normalizeName(variation).replace(/^(\d+(?:\.\d+)?)\s*0z$/, '$1 oz'); // "6 0Z" typed with a zero
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
  const prepPieces = new Map<string, number>(); // recipeId → pieces still to plate
  const prepOnlyCounts = new Map<string, number>(); // JSON [title, variation] → count
  const dishes = new Map<string, Set<string>>(); // recipeId → menu dishes it's plated in (still to prep)
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

    if (item.kind === 'prepOnly') {
      if (o.remaining > 0) add(prepOnlyCounts, JSON.stringify([item.titles[0] ?? o.item, o.variation]), o.remaining);
      for (const pk of item.packaging) add(containers, pk.container, pk.qty * o.quantity);
      add(labels, item.titles[0] ?? o.item, item.labels * o.quantity);
      continue;
    }

    if (item.kind === 'sidePlate') {
      const picks = parseSidePicks(o.variation);
      if (!picks.length) { flag({ kind: 'side', title: o.item, side: '(no sides listed)' }); continue; }
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
      const each = (p: Portion) => (p.pieces ? `${p.pieces} pcs` : `${p.oz} oz`);
      sizeLabel = key.startsWith('family') ? p => `Family ${each(p)}` : each;
    }

    for (const p of portions) {
      let oz = p.oz;
      if (p.pieces !== undefined) {
        const per = recipes.get(p.recipeId)?.ozPerPiece;
        if (!per) { flag({ kind: 'pieces', recipeId: p.recipeId }); continue; }
        oz = p.pieces * per;
        add(prepPieces, p.recipeId, p.pieces * o.remaining);
      }
      add(shopOz, p.recipeId, oz! * o.quantity);
      add(prepOz, p.recipeId, oz! * o.remaining);
      if (o.remaining > 0) dishes.set(p.recipeId, (dishes.get(p.recipeId) ?? new Set()).add(dishName(item.titles[0] ?? o.item)));
      countPortion(p.recipeId, sizeLabel(p), oz!, portionCount);
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
  const aisle = (c: string) => { const i = STORE_ORDER.indexOf(c); return i < 0 ? STORE_ORDER.length : i; };
  const allBuys = [...buyOz].map(([id, oz]) => buyLine(ingredients.get(id)!, oz))
    .sort((a, b) => aisle(a.category) - aisle(b.category) || a.category.localeCompare(b.category) || byName(a, b));
  const shoppingList = allBuys.filter(l => !ingredients.get(l.ingredientId)!.staple);
  const pantry = allBuys.filter(l => ingredients.get(l.ingredientId)!.staple);

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

  // A dish made from a base recipe at the same station (Mashed Potatoes from Boiled Potatoes, both
  // boil) shows only nested under the base, so the station sees one pot, not two lines.
  const nested = new Set<string>();
  for (const [subId, parents] of prep.usedIn) {
    const station = recipes.get(subId)?.method;
    for (const parentId of parents.keys()) if (recipes.get(parentId)?.method === station) nested.add(parentId);
  }

  // What each line is for: dishes it's plated in, then recipes it goes into.
  const forOf = (recipeId: string) => [...new Set([
    ...[...(dishes.get(recipeId) ?? [])].sort(),
    ...[...(prep.usedIn.get(recipeId)?.keys() ?? [])].map(id => recipes.get(id)?.name ?? id).sort(),
  ])];

  const methods = new Map<CookingMethod, PrepLine[]>();
  for (const [recipeId, oz] of prep.total) {
    const recipe = recipes.get(recipeId);
    if (!recipe || oz <= 0 || nested.has(recipeId) || recipe.onPrepSheet === false) continue;
    // No station means no station's list: flag it at the top instead of a catch-all at the bottom.
    if (recipe.method === 'unassigned') { flag({ kind: 'station', recipeId, lb: round2(oz / 16) }); continue; }
    const list = methods.get(recipe.method) ?? [];
    const line: PrepLine = { recipeId, name: recipe.name, finishedLb: round2(oz / 16), for: forOf(recipeId) };
    const pieces = prepPieces.get(recipeId);
    if (pieces) line.pieces = pieces;
    if (recipe.prepGroup) line.group = recipe.prepGroup;
    const sameStation = [...(prep.usedIn.get(recipeId)?.keys() ?? [])].filter(id => nested.has(id) && recipes.get(id)?.method === recipe.method);
    if (sameStation.length) {
      line.nested = sameStation
        .map(id => ({ recipeId: id, name: recipes.get(id)?.name ?? id, lb: round2((prep.total.get(id) ?? 0) / 16), for: forOf(id) }))
        .sort((a, b) => a.name.localeCompare(b.name));
    }
    list.push(line);
    methods.set(recipe.method, list);
  }
  const recipeCards: Record<string, RecipeCard> = {};
  for (const [recipeId, oz] of prep.total) {
    const recipe = recipes.get(recipeId);
    const batch = recipe ? finishedBatchOz(recipe, ingredients) : 0;
    if (recipe && oz > 0 && batch > 0 && recipe.lines.length) recipeCards[recipeId] = buildCard(recipe, oz / batch, recipes, ingredients);
  }

  const prepSheet = [...methods]
    // Grouped lines first (by group), then the rest, each by name.
    .map(([method, items]) => ({
      method,
      items: items.sort((a, b) => (a.group ? 0 : 1) - (b.group ? 0 : 1) || (a.group ?? '').localeCompare(b.group ?? '') || a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => STATION_ORDER.indexOf(a.method) - STATION_ORDER.indexOf(b.method));

  return {
    complete: unresolved.size === 0,
    unresolved: [...unresolved.values()],
    shoppingList,
    pantry,
    components,
    prepSheet,
    labels: [...labels].map(([title, count]) => ({ title, count })),
    containers: [...containers].map(([container, count]) => ({ container, count })).sort((a, b) => a.container.localeCompare(b.container)),
    recipeCards,
    prepOnly: [...prepOnlyCounts]
      .map(([k, count]) => { const [title, variation] = JSON.parse(k) as [string, string]; return { title, variation, count }; })
      .sort((a, b) => a.title.localeCompare(b.title) || a.variation.localeCompare(b.variation)),
  };
}
