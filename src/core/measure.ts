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
