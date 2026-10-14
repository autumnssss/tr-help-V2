import type { OrderLine } from '../src/core/hotplate';
import { plan, type Catalog } from '../src/core/planner';

const order = (item: string, quantity: number, variation = '', remaining = quantity): OrderLine =>
  ({ windowStart: '2026-10-13 00:00:00', item, variation, quantity, remaining });

// 20–25 count shrimp ≈ 22.5/lb raw = 0.711 oz each; 80% cooked yield → 0.569 oz finished each.
const catalog: Catalog = {
  ingredients: [{ id: 'shrimp', name: 'shrimp 20-25', yield: 0.8, yieldSource: 'estimate', purchase: { unit: '2 lb bag', oz: 32 } }],
  recipes: [{ id: 'shrimp', name: 'Shrimp', method: 'saute', lines: [{ ingredientId: 'shrimp', oz: 16 }], ozPerPiece: 0.569 }],
  menu: [
    {
      id: 'sg', titles: ['Shrimp & Grits'], kind: 'meal',
      sizes: {
        regular: { portions: [{ recipeId: 'shrimp', pieces: 9 }], packaging: [], labels: 1 },
        '6 oz': { portions: [{ recipeId: 'shrimp', pieces: 12 }], packaging: [], labels: 1 },
        family: { portions: [{ recipeId: 'shrimp', oz: 16 }], packaging: [], labels: 3 }, // weighed out
      },
    },
    { id: 'sd', titles: ['Sourdough - choose from our most popular flavors'], kind: 'prepOnly', packaging: [{ container: 'Bread bag', qty: 1 }], labels: 1 },
  ],
  sides: {},
};

describe('portions in pieces', () => {
  const p = plan([order('Shrimp & Grits', 10), order('Shrimp & Grits', 2, '6 OZ'), order('Shrimp & Grits', 1, 'Family')], catalog);

  it('plates by count and buys by weight', () => {
    const line = p.prepSheet.find(g => g.method === 'saute')!.items[0]!;
    expect(line.pieces).toBe(114); // 10×9 + 2×12; family is weighed, not counted
    // finished: 114 × 0.569 + 16 = 80.87 oz → raw ÷ 0.8 = 101.08 oz → four 2 lb bags
    expect(p.shoppingList[0]).toMatchObject({ packages: { count: 4, unit: '2 lb bag' } });
    expect(p.unresolved).toEqual([]);
  });

  it('flags a piece portion with no weight per piece', () => {
    const noWeight = { ...catalog, recipes: [{ ...catalog.recipes[0]!, ozPerPiece: undefined }] };
    expect(plan([order('Shrimp & Grits', 1)], noWeight).unresolved).toEqual([{ kind: 'pieces', recipeId: 'shrimp' }]);
  });
});

describe('prep-only items (Artisan Sweets)', () => {
  const p = plan([
    order('Sourdough - choose from our most popular flavors', 3, 'Jalapeño Cheddar', 2),
    order('Sourdough - choose from our most popular flavors', 1, 'Plain'),
  ], catalog);

  it('lists what is still to make by flavor, with labels and packaging, and buys nothing', () => {
    expect(p.prepOnly).toEqual([
      { title: 'Sourdough - choose from our most popular flavors', variation: 'Jalapeño Cheddar', count: 2 },
      { title: 'Sourdough - choose from our most popular flavors', variation: 'Plain', count: 1 },
    ]);
    expect(p.labels).toEqual([{ title: 'Sourdough - choose from our most popular flavors', count: 4 }]);
    expect(p.containers).toEqual([{ container: 'Bread bag', count: 4 }]);
    expect(p.shoppingList).toEqual([]);
    expect(p.unresolved).toEqual([]); // flavors never need setting up
  });
});
