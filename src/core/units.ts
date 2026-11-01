// Kitchen-friendly display of scaled recipe amounts. All rounding is done here, in code.

const VOLUME = new Set(['tsp', 't', 'teaspoon', 'teaspoons', 'tbsp', 'tbs', 'tablespoon', 'tablespoons', 'cup', 'cups', 'c']);
const WEIGHT = new Set(['oz', 'ounce', 'ounces', 'lb', 'lbs', 'pound', 'pounds', 'g', 'gram', 'grams', 'kg']);

const FRACTIONS: Record<number, string> = { 1: '1/8', 2: '1/4', 3: '3/8', 4: '1/2', 5: '5/8', 6: '3/4', 7: '7/8' };

/** 2.375 → "2 3/8" (nearest eighth). Under 1/16 → "pinch". */
export function toEighths(n: number): string {
  const eighths = Math.round(n * 8);
  if (eighths === 0) return 'pinch';
  const whole = Math.floor(eighths / 8);
  const rest = eighths % 8;
  if (!rest) return String(whole);
  return whole ? `${whole} ${FRACTIONS[rest]}` : FRACTIONS[rest]!;
}

const trim = (n: number, places: number) => String(Number(n.toFixed(places)));

/** Scaled amount in the recipe's own unit: cups/spoons in eighths, weights to 2 places, counts to 1. */
export function formatAmount(amount: number, unit: string): string {
  const u = unit.toLowerCase().replace(/\./g, '').trim();
  if (VOLUME.has(u)) {
    const shown = toEighths(amount);
    // "1 cup", "1 5/8 cups": the recipe's own word for one, made plural or singular to match.
    const word = u === 'cup' || u === 'cups' ? (shown === '1' || !/\d/.test(shown) || /^\d\/\d$/.test(shown) ? 'cup' : 'cups') : unit;
    return `${shown} ${word}`;
  }
  if (WEIGHT.has(u)) return `${trim(amount, 2)} ${unit}`;
  return `${trim(amount, 1)}${unit ? ` ${unit}` : ''}`;
}

/** Weight for lines with no amount/unit: oz under a pound, lb above. */
export function formatOz(oz: number): string {
  return oz < 16 ? `${trim(oz, 2)} oz` : `${trim(oz / 16, 2)} lb`;
}

/**
 * A line's name on a scaled card. The original recipe's hints in brackets ("celery, sliced (2 stalks)",
 * "garlic (1 tbsp)") describe the unscaled amount, so they're dropped once the recipe is scaled; the scaled amount
 * in front is what to use.
 */
export function scaledName(name: string, batches: number): string {
  if (Math.abs(batches - 1) < 1e-9) return name;
  return name.replace(/\s*\([^)]*\d[^)]*\)/g, '').trim();
}
