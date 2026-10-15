import type { OrderLine } from '../src/core/hotplate';
import { plan, type Catalog } from '../src/core/planner';
import { formatAmount, toEighths } from '../src/core/units';

const order = (item: string, quantity: number, remaining = quantity): OrderLine =>
  ({ windowStart: '2026-10-20 00:00:00', item, variation: '', quantity, remaining });

// Soup: one batch is 32 oz cooked. Broth is mixed in (no prep line): 1 cup water + 1 tsp base per 8.5 oz.
const catalog: Catalog = {
  ingredients: [
    { id: 'noodles', name: 'Egg noodles', yield: 1, yieldSource: 'estimate' },
    { id: 'water', name: 'Water', yield: 1, yieldSource: 'kitchen', staple: true },
    { id: 'btb', name: 'Better Than Bouillon, chicken', yield: 1, yieldSource: 'estimate', staple: true },
  ],
  recipes: [
    { id: 'broth', name: 'Chicken Broth', method: 'no-cook', onPrepSheet: false, lines: [
      { ingredientId: 'water', oz: 8.3, amount: 1, unit: 'cup' },
      { ingredientId: 'btb', oz: 0.2, amount: 1, unit: 'tsp' },
    ] },
    { id: 'soup', name: 'Chicken Noodle Soup', method: 'simmer', finishedOz: 32, lines: [
      { ingredientId: null, recipeId: 'broth', name: 'chicken broth', oz: 25.5, amount: 3, unit: 'cups' }, // 3 × 8.5 oz
      { ingredientId: 'noodles', name: 'egg noodles', oz: 8, amount: 8, unit: 'oz' },
    ] },
  ],
  menu: [{ id: 's', titles: ['Soup'], kind: 'meal', sizes: { regular: { portions: [{ recipeId: 'soup', oz: 16 }], packaging: [], labels: 1 } } }],
  sides: {},
};

describe('scaled recipe cards', () => {
  // 6 soups still to make × 16 oz = 96 oz cooked ÷ 32 oz per batch = 3 batches.
  const p = plan([order('Soup', 8, 6)], catalog);

  it('multiplies each line to what is still to prep (Remaining), in the recipe’s own units', () => {
    const card = p.recipeCards.soup!;
    expect(card.batches).toBe(3);
    expect(card.lines.map(l => [l.name, l.amount, l.unit])).toEqual([
      ['Chicken Broth', 9, 'cups'],
      ['egg noodles', 24, 'oz'],
    ]);
  });

  it('marks mixed-in sub-recipes and scales them too (broth: cups of water, tsp of base)', () => {
    expect(p.recipeCards.soup!.lines[0]!.mixedIn).toBe(true);
    // The soup's share: 9 cups of broth → 9 batches of 1 cup water + 1 tsp base.
    const broth = p.recipeCards.soup!.lines[0]!.sub!;
    expect(broth.batches).toBe(9);
    expect(broth.lines.map(l => formatAmount(l.amount!, l.unit))).toEqual(['9 cup', '9 tsp']);
  });
});

describe('formatAmount', () => {
  it('shows cups and spoons in eighths, weights to 2 places, counts to 1', () => {
    expect(toEighths(2.375)).toBe('2 3/8');
    expect(toEighths(0.24)).toBe('1/4');
    expect(toEighths(0.03)).toBe('pinch');
    expect(formatAmount(2.3, 'cups')).toBe('2 1/4 cups');
    expect(formatAmount(4.856, 'lbs')).toBe('4.86 lbs');
    expect(formatAmount(5.75, 'large')).toBe('5.8 large');
    expect(formatAmount(3, '')).toBe('3');
  });
});
