import { readFileSync } from 'node:fs';
import { parseHotplateCsv, type OrderLine } from '../src/core/hotplate';
import { casseroleMeal, plan, standardMeal, type Catalog, type Ingredient, type Recipe } from '../src/core/planner';

const order = (item: string, quantity: number, variation = '', remaining = quantity): OrderLine =>
  ({ windowStart: '2026-10-13 00:00:00', item, variation, quantity, remaining });

const ing = (id: string, y: number, extra: Partial<Ingredient> = {}): Ingredient =>
  ({ id, name: id, yield: y, yieldSource: 'kitchen', ...extra });

/** One-ingredient recipe: 16 oz as purchased. */
const simple = (id: string, method: Recipe['method'] = 'roast'): Recipe =>
  ({ id, name: id, method, lines: [{ ingredientId: id, oz: 16 }] });

const lb = (p: ReturnType<typeof plan>, id: string) => p.shoppingList.find(l => l.ingredientId === id)?.lb;

const base: Catalog = {
  ingredients: [
    ing('pork butt', 0.55),
    ing('potatoes', 0.8),
    ing('carrots', 0.8),
    ing('brisket', 0.5),
    ing('brussels sprouts', 0.64, { buffer: 0.1 }),
    ing('grits', 4), // dry grits gain water
    ing('shrimp', 0.8, { purchase: { unit: '2 lb bag', oz: 32 } }),
    ing('cheddar', 1),
  ],
  recipes: [
    simple('pork butt', 'smoke'),
    simple('potatoes', 'boil'),
    simple('carrots'),
    simple('brisket', 'smoke'),
    simple('brussels sprouts'),
    simple('shrimp', 'saute'),
    { id: 'cheesy grits', name: 'cheesy grits', method: 'boil', lines: [{ ingredientId: 'grits', oz: 4 }, { ingredientId: 'cheddar', oz: 4 }] },
  ],
  menu: [
    {
      id: 'pork', titles: ['Mississippi Pork Roast'], kind: 'meal',
      sizes: {
        regular: { portions: standardMeal('pork butt', 'potatoes', 'carrots').regular, packaging: [{ container: '24 oz divided', qty: 1 }], labels: 1 },
        family: { portions: standardMeal('pork butt', 'potatoes', 'carrots').family, packaging: [{ container: '24 oz long plate', qty: 3 }], labels: 3 },
      },
    },
    {
      id: 'beef', titles: ['Smoked Beef by the pound'], kind: 'meal',
      sizes: {
        regular: {
          portions: [{ recipeId: 'brisket', oz: 16 }],
          packaging: [{ container: '24 oz long plate', qty: 1 }, { container: '4 oz styro cup', qty: 1 }],
          labels: 1,
        },
      },
    },
    {
      id: 'shrimp', titles: ['Shrimp & Grits with Brussels sprouts'], kind: 'meal',
      sizes: {
        regular: { portions: casseroleMeal('shrimp', 'brussels sprouts').regular, packaging: [], labels: 1 },
        family: { portions: casseroleMeal('shrimp', 'brussels sprouts').family, packaging: [], labels: 3 },
      },
    },
    {
      id: 'grits side', titles: ['Grits'], kind: 'meal',
      sizes: { regular: { portions: [{ recipeId: 'cheesy grits', oz: 4 }], packaging: [], labels: 1 }, '6 oz': { portions: [{ recipeId: 'cheesy grits', oz: 6 }], packaging: [], labels: 1 } },
    },
    { id: 'garden', titles: ['Garden Vegetable and Sides'], kind: 'sidePlate', sideOz: 4, packaging: [{ container: '24 oz long plate', qty: 1 }], labels: 1 },
  ],
  sides: { 'Glazed Carrots': 'carrots', 'Brussels Sprouts': 'brussels sprouts' },
};

describe('plan: shopping list', () => {
  it('buys finished weight ÷ yield (brisket 50% loss: 1 lb finished = 2 lb raw)', () => {
    expect(lb(plan([order('Smoked Beef by the pound ', 3)], base), 'brisket')).toBe(6);
  });

  it('family = 1 lb finished of each component', () => {
    const p = plan([order('Mississippi Pork Roast', 2, 'Family ')], base);
    expect(lb(p, 'pork butt')).toBe(3.64); // 2 lb ÷ 0.55
    expect(lb(p, 'potatoes')).toBe(2.5); // 2 lb ÷ 0.8
  });

  it('regular = 4 oz each component', () => {
    expect(lb(plan([order('Mississippi Pork Roast', 4)], base), 'carrots')).toBe(1.25); // 1 lb ÷ 0.8
  });

  it('casserole regular = 8 oz entree + 4 oz veg, and applies the buffer', () => {
    const p = plan([order('Shrimp & Grits with Brussels sprouts', 4)], base);
    expect(lb(p, 'shrimp')).toBe(2.5); // 2 lb ÷ 0.8
    expect(lb(p, 'brussels sprouts')).toBe(1.72); // 1 lb ÷ 0.64 × 1.1
  });

  it('rounds up to whole purchase packages', () => {
    const p = plan([order('Shrimp & Grits with Brussels sprouts', 4)], base);
    expect(p.shoppingList.find(l => l.ingredientId === 'shrimp')?.packages).toEqual({ count: 2, unit: '2 lb bag' });
  });

  it('handles yields over 100% and multi-ingredient recipes', () => {
    // batch: 4 oz grits × 4 + 4 oz cheddar × 1 = 20 oz finished. 20 × 6 oz = 120 oz needed = 6 batches.
    const p = plan([order('Grits', 20, '6 OZ')], base);
    expect(p.shoppingList.find(l => l.ingredientId === 'grits')?.oz).toBe(24);
    expect(p.shoppingList.find(l => l.ingredientId === 'cheddar')?.oz).toBe(24);
  });

  it('splits side plates into 4 oz sides, counting 2x picks', () => {
    const p = plan([order('Garden Vegetable and Sides - Menu E', 1, 'Glazed Carrots • 2x Brussels Sprouts')], base);
    expect(lb(p, 'carrots')).toBe(0.31); // 4 oz ÷ 0.8 = 5 oz
    expect(p.shoppingList.find(l => l.ingredientId === 'brussels sprouts')?.oz).toBe(13.75); // 8 oz ÷ 0.64 × 1.1
  });

  it('sums the same ingredient across every meal into one line', () => {
    const p = plan([
      order('Mississippi Pork Roast', 4),
      order('Garden Vegetable and Sides', 1, 'Glazed Carrots'),
    ], base);
    expect(p.shoppingList.filter(l => l.ingredientId === 'carrots')).toHaveLength(1);
    expect(p.shoppingList.find(l => l.ingredientId === 'carrots')?.oz).toBe(25); // (16 + 4) ÷ 0.8
  });

  it('uses a measured finished weight over the estimate', () => {
    const measured = { ...base, recipes: base.recipes.map(r => r.id === 'brisket' ? { ...r, finishedOz: 6.4 } : r) };
    expect(lb(plan([order('Smoked Beef by the pound', 1)], measured), 'brisket')).toBe(2.5); // 16 ÷ 6.4 × 16 oz
  });
});

describe('plan: prep sheet, labels, containers', () => {
  it('prep totals use Remaining, one line per component, grouped by cooking method', () => {
    const p = plan([
      order('Mississippi Pork Roast', 4, '', 2),
      order('Garden Vegetable and Sides', 2, 'Glazed Carrots'),
    ], base);
    const roast = p.prepSheet.find(g => g.method === 'roast')?.items;
    expect(roast).toEqual([{ recipeId: 'carrots', name: 'carrots', finishedLb: 1, raw: { name: 'carrots', lb: 1.25 } }]); // 2×4 oz + 2×4 oz; raw at 80% yield
    expect(p.prepSheet.find(g => g.method === 'smoke')?.items[0]?.finishedLb).toBe(0.5);
  });

  it('counts labels and containers per order', () => {
    const p = plan([order('Mississippi Pork Roast', 5), order('Mississippi Pork Roast', 2, 'Family'), order('Smoked Beef by the pound', 1)], base);
    expect(p.labels).toContainEqual({ title: 'Mississippi Pork Roast', count: 11 });
    expect(p.containers).toEqual([
      { container: '24 oz divided', count: 5 },
      { container: '24 oz long plate', count: 7 },
      { container: '4 oz styro cup', count: 1 },
    ]);
  });
});

describe('plan: unknowns are flagged, never silently dropped', () => {
  it('flags unknown items, sizes and sides', () => {
    const p = plan([
      order('Spaghetti & Meatballs', 3),
      order('Smoked Beef by the pound', 1, '2 lb'),
      order('Garden Vegetable and Sides', 1, 'Corn niblets • Glazed Carrots'),
    ], base);
    expect(p.complete).toBe(false);
    expect(p.unresolved).toEqual([
      { kind: 'item', title: 'Spaghetti & Meatballs' },
      { kind: 'size', title: 'Smoked Beef by the pound', variation: '2 lb' },
      { kind: 'side', title: 'Garden Vegetable and Sides', side: 'Corn niblets' },
    ]);
  });

  it('flags recipe lines with no linked ingredient or no weight yet (V1 imports)', () => {
    const catalog: Catalog = {
      ...base,
      recipes: [
        ...base.recipes.filter(r => r.id !== 'brisket'),
        {
          id: 'brisket', name: 'brisket', method: 'smoke', lines: [
            { ingredientId: 'brisket', oz: 16 },
            { ingredientId: null, name: 'beef rub', oz: 1 },
            { ingredientId: 'cheddar', name: 'cheddar', oz: null },
          ],
        },
      ],
    };
    const p = plan([order('Smoked Beef by the pound', 1)], catalog);
    expect(p.unresolved).toEqual([
      { kind: 'ingredient', recipeId: 'brisket', ingredient: 'beef rub' },
      { kind: 'weight', recipeId: 'brisket', ingredient: 'cheddar' },
    ]);
    expect(lb(p, 'brisket')).toBeUndefined(); // no partial buy from a half-known recipe
  });

  it('runs the real prep list and reports every item it does not know yet', () => {
    const csv = readFileSync(new URL('./fixtures/hotplate-prep-list-2026-10-08.csv', import.meta.url), 'utf8');
    const p = plan(parseHotplateCsv(csv), base);
    const unknownItems = p.unresolved.filter(u => u.kind === 'item').map(u => u.title);
    expect(unknownItems).toEqual(expect.arrayContaining(['Chicken veggie pasta', 'Ribs with Corn Niblets & Potato Salad']));
    expect(lb(p, 'brisket')).toBe(2); // the 1 lb of smoked beef still makes the list
  });
});

describe('plan: per-component totals', () => {
  const ribs: Catalog = {
    ingredients: [ing('ribs', 0.5)],
    recipes: [simple('ribs', 'smoke')],
    menu: [{
      id: 'ribs', titles: ['Ribs'], kind: 'meal',
      sizes: {
        regular: { portions: [{ recipeId: 'ribs', oz: 4 }], packaging: [], labels: 1 },
        '6 oz': { portions: [{ recipeId: 'ribs', oz: 6 }], packaging: [], labels: 1 },
        family: { portions: [{ recipeId: 'ribs', oz: 16 }], packaging: [], labels: 2 },
      },
    }],
    sides: {},
  };

  it('shows portion counts, cooked total and what to buy', () => {
    const p = plan([order('Ribs', 6), order('Ribs', 1, '6 OZ'), order('Ribs', 2, 'Family - Full Rack + sides')], ribs);
    expect(p.components).toEqual([{
      recipeId: 'ribs', name: 'ribs', method: 'smoke',
      portions: [
        { label: '4 oz', oz: 4, count: 6 },
        { label: '6 oz', oz: 6, count: 1 },
        { label: 'Family', oz: 16, count: 2 },
      ],
      finishedOz: 62, finishedLb: 3.88,
      buy: [{ ingredientId: 'ribs', name: 'ribs', oz: 124, lb: 7.75 }],
    }]);
  });

  it('counts side-plate 2x picks as separate side portions', () => {
    const p = plan([order('Garden Vegetable and Sides', 1, 'Glazed Carrots • 2x Brussels Sprouts')], base);
    expect(p.components.find(c => c.recipeId === 'brussels sprouts')?.portions).toEqual([{ label: '4 oz', oz: 4, count: 2 }]);
  });
});
