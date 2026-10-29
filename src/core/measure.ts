// Recipe line amount + unit → as-purchased ounces, for the recipe editor. Pure; all conversion is here.
// Weights convert exactly. Cups and spoons use the ingredient's weight per cup, counts its weight per each;
// both are entered by the kitchen the first time they're needed. Nothing is guessed: no weight → null.

export type MeasureIngredient = {
  yield: number;
  gramsPerCup?: number;
  gramsPerEach?: number;
  /** How it's bought, e.g. { unit: 'cans', oz: 15 }: "2 cans" weighs 2 × 15 oz. */
  purchase?: { unit: string; oz: number };
};

export type UnitKind = 'weight' | 'volume' | 'count';

const GRAMS_PER_OZ = 28.3495;
const WEIGHT_OZ: Record<string, number> = { oz: 1, ounce: 1, ounces: 1, lb: 16, lbs: 16, pound: 16, pounds: 16, g: 1 / GRAMS_PER_OZ, gram: 1 / GRAMS_PER_OZ, grams: 1 / GRAMS_PER_OZ, kg: 1000 / GRAMS_PER_OZ };
const VOLUME_CUPS: Record<string, number> = {
  cup: 1, cups: 1, c: 1, tbsp: 1 / 16, tbs: 1 / 16, tablespoon: 1 / 16, tablespoons: 1 / 16,
  tsp: 1 / 48, teaspoon: 1 / 48, teaspoons: 1 / 48, pint: 2, pints: 2, quart: 4, quarts: 4, qt: 4, gallon: 16, gallons: 16, gal: 16,
  'fl oz': 1 / 8,
};

// Recipe shorthand is case-sensitive: "T" = tablespoon, "t" = teaspoon.
const clean = (unit: string) => {
  const u = unit.replace(/\./g, '').trim();
  return u === 'T' ? 'tbsp' : u === 't' ? 'tsp' : u.toLowerCase();
};
const singular = (u: string) => u.replace(/e?s$/, '');

export function unitKind(unit: string): UnitKind {
  const u = clean(unit);
  if (u in WEIGHT_OZ) return 'weight';
  if (u in VOLUME_CUPS) return 'volume';
  return 'count';
}

/**
 * As-purchased oz for one recipe line, or null when a weight per cup / per each is still needed.
 * Weights are as bought. Cups and spoons measure the prepped food, so they're divided by the ingredient's
 * yield to get what to buy (1 cup diced onion needs a bit more than 1 cup's weight of onion).
 */
export function lineOz(amount: number | null, unit: string, ing: MeasureIngredient | undefined): number | null {
  if (amount === null || !Number.isFinite(amount)) return null;
  const u = clean(unit);
  if (u in WEIGHT_OZ) return amount * WEIGHT_OZ[u]!;
  if (!ing) return null;
  if (u in VOLUME_CUPS) {
    if (!ing.gramsPerCup) return null;
    return (amount * VOLUME_CUPS[u]! * ing.gramsPerCup) / GRAMS_PER_OZ / ing.yield;
  }
  // Counted: the package it's bought in ("2 cans"), else its weight per each.
  if (ing.purchase && u && singular(clean(ing.purchase.unit).split(/\s|\(/)[0]!) === singular(u)) return amount * ing.purchase.oz;
  if (ing.gramsPerEach) return (amount * ing.gramsPerEach) / GRAMS_PER_OZ;
  return null;
}

/** What to ask for when a line has no weight: "1 cup of X weighs __ oz" or "1 X weighs __ oz". */
export function missingWeight(unit: string): 'cup' | 'each' | null {
  const kind = unitKind(unit);
  return kind === 'weight' ? null : kind === 'volume' ? 'cup' : 'each';
}

export const ozToGrams = (oz: number) => oz * GRAMS_PER_OZ;
export const gramsToOz = (g: number) => g / GRAMS_PER_OZ;

/**
 * Weight as the kitchen reads it (2026-10-23): under a pound in ounces ("10.9 oz"), a pound or more in pounds
 * and whole ounces ("1 lb 4 oz", not "1.25 lb"). roundUp for buying (never short); otherwise nearest ounce.
 */
export function lbOz(oz: number, roundUp = false): string {
  if (oz < 16) return `${oz < 1 ? oz.toFixed(2) : oz.toFixed(1)} oz`;
  const whole = roundUp ? Math.ceil(oz - 1e-9) : Math.round(oz);
  const lb = Math.floor(whole / 16), rest = whole % 16;
  return rest ? `${lb} lb ${rest} oz` : `${lb} lb`;
}

const FRACTIONS: [number, string][] = [[1 / 4, '¼'], [1 / 3, '⅓'], [1 / 2, '½'], [2 / 3, '⅔'], [3 / 4, '¾']];

/** Part of a package: "¼", "⅓" under 1 when close to one of those, else up to 2 decimals ("3.25", "0.12", "2"). */
export function packageCount(n: number): string {
  if (n < 1) {
    const f = FRACTIONS.find(([v]) => Math.abs(n - v) < 0.03);
    if (f) return f[1];
  }
  return String(Math.round(n * 100) / 100);
}

/** "1 bunch", "1 bag (10 oz)", "2 bunches", "¼ quart": units are stored plural; 1 or less reads singular. */
export function unitLabel(n: number, unit: string): string {
  return n > 1 ? unit : unit.replace(/^\S+/, w => w.replace(/(ch|sh|ss|x)es$/, '$1').replace(/([^s])s$/, '$1'));
}

/** Cups to the nearest quarter, as kitchen fractions: 1, 1½, ¾. */
function cups(n: number): string {
  const q = Math.max(1, Math.round(n * 4));
  const whole = Math.floor(q / 4), part = ['', '¼', '½', '¾'][q % 4]!;
  return `${whole || ''}${part}` + (q <= 4 ? ' cup' : ' cups');
}

type BuyIngredient = Pick<MeasureIngredient, 'purchase' | 'gramsPerEach'> & { eachUnit?: string };

/**
 * What the shopping list says to buy (kitchen 2026-10-29): the amount needed, never rounded up to whole packages
 * (there may be some on the shelf, and an ounce short is fine).
 *  - by weight: "1 lb 4 oz" (pasta, rice, grains, meat, produce bought loose)
 *  - liquids bought by the quart/gallon: "1 cup (¼ quart)"
 *  - counted by the each: "6 cloves (⅓ head)"
 *  - packages: "3.25 cans", "½ bag (10 oz)"
 */
export function buyAmount(oz: number, ing: BuyIngredient | undefined): string {
  const p = ing?.purchase;
  // Things bought one at a time (eggs, limes, a chicken) can't be bought in part: whole numbers, rounded up.
  const whole = p && !/\(/.test(p.unit) && /^(eggs?|limes?|lemons?|peppers?|onions?|chickens?|potato(es)?|packs?)$/i.test(p.unit.trim());
  const share = p ? (whole ? Math.ceil(oz / p.oz - 0.02) : oz / p.oz) : 0;
  const pkg = p ? `${packageCount(share)} ${unitLabel(share, p.unit)}` : '';
  if (ing?.eachUnit && ing.gramsPerEach) {
    const each = Math.max(1, Math.round((oz * GRAMS_PER_OZ) / ing.gramsPerEach));
    return `${each} ${unitLabel(each, ing.eachUnit)}` + (pkg ? ` (${pkg})` : '');
  }
  if (!p) return lbOz(oz, true);
  const u = clean(p.unit.split(/\s|\(/)[0]!);
  const perPackage = /^(quart|gallon|pint)/.test(u) ? VOLUME_CUPS[u] ?? VOLUME_CUPS[singular(u)] : undefined; // liquids by the quart/gallon
  if (perPackage) return `${cups(share * perPackage)} (${pkg})`;
  return pkg;
}
