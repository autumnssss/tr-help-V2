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

describe('side plates with no sides listed', () => {
  it('are flagged, not silently dropped', () => {
    const c: Catalog = { ...catalog, menu: [{ id: 'g', titles: ['Garden Vegetable and Sides'], kind: 'sidePlate', sideOz: 4, packaging: [], labels: 1 }] };
    expect(plan([order('Garden Vegetables and sides - Menu A', 3)], { ...c, menu: [{ ...c.menu[0]!, titles: ['Garden Vegetables and sides'] }] }).unresolved)
      .toEqual([{ kind: 'side', title: 'Garden Vegetables and sides - Menu A', side: '(no sides listed)' }]);
  });
});

describe('staples', () => {
  it('stay off the shopping list but show under pantry; counted items read as a count', () => {
    const c: Catalog = {
      ingredients: [
        { id: 'eggs', name: 'Eggs', yield: 0.88, yieldSource: 'estimate', purchase: { unit: 'eggs', oz: 1.75 } },
        { id: 'salt', name: 'Kosher salt', yield: 1, yieldSource: 'estimate', staple: true },
      ],
      recipes: [{ id: 'm', name: 'Meatloaf', method: 'bake', lines: [{ ingredientId: 'eggs', oz: 3.5 }, { ingredientId: 'salt', oz: 0.25 }] }],
      menu: [{ id: 'ml', titles: ['Meatloaf'], kind: 'meal', sizes: { regular: { portions: [{ recipeId: 'm', oz: 4 }], packaging: [], labels: 1 } } }],
      sides: {},
    };
    const p = plan([order('Meatloaf', 12)], c); // 48 oz ÷ 3.33 oz batch = 14.4 batches × 2 eggs = 28.8 → 29
    expect(p.shoppingList.map(l => [l.name, l.packages])).toEqual([['Eggs', { count: 29, unit: 'eggs' }]]);
    expect(p.pantry.map(l => l.name)).toEqual(['Kosher salt']);
  });
});

describe('shopping list order', () => {
  it('groups by store section in walking order, then by name', () => {
    const ing = (id: string, category: string) => ({ id, name: id, yield: 1, yieldSource: 'estimate' as const, category });
    const c: Catalog = {
      ingredients: [ing('shrimp', 'Meat & Seafood'), ing('broth', 'Canned & Dry'), ing('chicken breast', 'Meat & Seafood'), ing('onion', 'Produce')],
      recipes: [{ id: 'r', name: 'r', method: 'saute', lines: ['shrimp', 'broth', 'chicken breast', 'onion'].map(i => ({ ingredientId: i, oz: 1 })) }],
      menu: [{ id: 'm', titles: ['M'], kind: 'meal', sizes: { regular: { portions: [{ recipeId: 'r', oz: 4 }], packaging: [], labels: 1 } } }],
      sides: {},
    };
    expect(plan([order('M', 1)], c).shoppingList.map(l => l.name)).toEqual(['onion', 'chicken breast', 'shrimp', 'broth']);
  });
});
