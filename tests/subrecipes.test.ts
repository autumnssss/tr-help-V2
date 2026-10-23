import type { OrderLine } from '../src/core/hotplate';
import { plan, type Catalog } from '../src/core/planner';

const order = (item: string, quantity: number, remaining = quantity): OrderLine =>
  ({ windowStart: '2026-10-13 00:00:00', item, variation: '', quantity, remaining });

const one = (id: string, recipeId: string, oz: number) =>
  ({ id, titles: [id], kind: 'meal' as const, sizes: { regular: { portions: [{ recipeId, oz }], packaging: [], labels: 1 } } });

// Boiled potatoes are one base recipe; potato salad and mashed potatoes each use it.
const catalog: Catalog = {
  ingredients: [
    { id: 'potatoes', name: 'potatoes', yield: 0.8, yieldSource: 'usda' },
    { id: 'mayo', name: 'mayo', yield: 1, yieldSource: 'kitchen' },
    { id: 'butter', name: 'butter', yield: 1, yieldSource: 'kitchen' },
  ],
  recipes: [
    { id: 'boiled', name: 'Boiled Potatoes', method: 'boil', lines: [{ ingredientId: 'potatoes', oz: 40 }] }, // 32 oz finished
    { id: 'salad', name: 'Potato Salad', method: 'boil', lines: [{ ingredientId: null, recipeId: 'boiled', oz: 32 }, { ingredientId: 'mayo', oz: 8 }] }, // 40 oz
    { id: 'mash', name: 'Mashed Potatoes', method: 'bake', lines: [{ ingredientId: null, recipeId: 'boiled', oz: 32 }, { ingredientId: 'butter', oz: 4 }] }, // 36 oz
  ],
  menu: [one('Ribs', 'salad', 4), one('Meatloaf', 'mash', 9), one('Boiled potato side', 'boiled', 4)],
  sides: {},
};

describe('recipes inside recipes', () => {
  // 25 × 4 oz salad = 100 oz → 80 oz boiled (5 lb); 14 × 9 oz mash = 126 oz → 112 oz boiled (7 lb)
  const p = plan([order('Ribs', 25), order('Meatloaf', 14)], catalog);

  it('a base plated on its own keeps its line (with every use), and each dish gets its own line', () => {
    const boil = p.prepSheet.find(g => g.method === 'boil')!;
    expect(boil.items).toEqual([
      { recipeId: 'boiled', name: 'Boiled Potatoes', finishedLb: 12, for: ['Mashed Potatoes', 'Potato Salad'] },
      { recipeId: 'salad', name: 'Potato Salad', finishedLb: 6.25, for: ['Ribs'] }, // 25 × 4 oz
    ]);
    expect(p.prepSheet.find(g => g.method === 'bake')!.items.map(i => i.name)).toEqual(['Mashed Potatoes']);
    expect(p.unresolved).toEqual([]);
  });

  it('standard: a base only used inside other recipes has no line; each dish has its own and carries the base in its card', () => {
    const baseOnly: Catalog = { ...catalog, menu: catalog.menu.filter(m => m.id !== 'Boiled potato side') };
    const q = plan([order('Ribs', 25), order('Meatloaf', 14)], baseOnly);
    expect(q.prepSheet.find(g => g.method === 'boil')!.items).toEqual([
      { recipeId: 'salad', name: 'Potato Salad', finishedLb: 6.25, for: ['Ribs'] },
    ]);
    expect(q.prepSheet.find(g => g.method === 'bake')!.items.map(i => i.name)).toEqual(['Mashed Potatoes']);
    expect(q.shoppingList).toEqual(p.shoppingList); // same potatoes bought either way
    // 25 × 4 oz salad = 100 oz = 2.5 batches → 80 oz of boiled potatoes, shown inside the salad card
    expect(q.recipeCards.salad!.lines[0]).toMatchObject({ recipeId: 'boiled', mixedIn: true, sub: { finishedOz: 80 } });
  });

  it('buys raw ingredients through the sub-recipe', () => {
    const lb = (id: string) => p.shoppingList.find(l => l.ingredientId === id)?.lb;
    expect(lb('potatoes')).toBe(15); // 12 lb boiled ÷ 0.8
    expect(lb('mayo')).toBe(1.25); // 100 oz salad × 8/40
    expect(lb('butter')).toBe(0.88); // 126 oz mash × 4/36 = 14 oz
  });

  it('says what a line is for: dishes it is plated in, then recipes it goes into', () => {
    const q = plan([order('Ribs', 25), order('Boiled potato side', 8)], catalog);
    expect(q.prepSheet.find(g => g.method === 'boil')!.items[0]!.for).toEqual(['Boiled potato side', 'Potato Salad']);
  });

  it('flags a recipe loop instead of hanging', () => {
    const loop: Catalog = {
      ...catalog,
      recipes: [
        { id: 'a', name: 'A', method: 'boil', lines: [{ ingredientId: null, recipeId: 'b', oz: 1 }] },
        { id: 'b', name: 'B', method: 'boil', lines: [{ ingredientId: null, recipeId: 'a', oz: 1 }] },
      ],
      menu: [one('Loop', 'a', 4)],
    };
    expect(plan([order('Loop', 1)], loop).unresolved).toContainEqual({ kind: 'cycle', recipeId: 'a' });
  });
});

describe('stations, pots and mixed-in recipes', () => {
  it('orders stations, groups shared pots first, and hides recipes mixed in on the spot', () => {
    const c: Catalog = {
      ingredients: [
        { id: 'potatoes', name: 'potatoes', yield: 1, yieldSource: 'estimate' },
        { id: 'beans', name: 'green beans', yield: 1, yieldSource: 'estimate' },
        { id: 'rice', name: 'rice', yield: 3, yieldSource: 'estimate' },
        { id: 'water', name: 'Water', yield: 1, yieldSource: 'kitchen', staple: true },
      ],
      recipes: [
        { id: 'boiled', name: 'Boiled Potatoes', method: 'boil', prepGroup: 'Salted water', lines: [{ ingredientId: 'potatoes', oz: 16 }] },
        { id: 'gb', name: 'Green Beans', method: 'boil', prepGroup: 'Salted water', lines: [{ ingredientId: 'beans', oz: 16 }] },
        { id: 'cr', name: 'Cooked Rice', method: 'boil', prepGroup: 'Rice', lines: [{ ingredientId: 'rice', oz: 16 }] },
        { id: 'broth', name: 'Chicken Broth', method: 'no-cook', onPrepSheet: false, lines: [{ ingredientId: 'water', oz: 8 }] },
        { id: 'soup', name: 'Soup', method: 'simmer', lines: [{ ingredientId: null, recipeId: 'broth', oz: 8 }] },
        { id: 'roast', name: 'Roast', method: 'smoke', lines: [{ ingredientId: 'potatoes', oz: 16 }] },
      ],
      menu: [one('Plate', 'boiled', 4), one('Beans', 'gb', 4), one('Rice', 'cr', 4), one('Soup', 'soup', 16), one('Roast', 'roast', 4)],
      sides: {},
    };
    const p = plan([order('Plate', 1), order('Beans', 1), order('Rice', 1), order('Soup', 1), order('Roast', 1)], c);
    expect(p.prepSheet.map(g => [g.method, g.items.map(i => `${i.group ?? '-'}:${i.name}`)])).toEqual([
      ['smoke', ['-:Roast']],
      ['boil', ['Rice:Cooked Rice', 'Salted water:Boiled Potatoes', 'Salted water:Green Beans']],
      ['simmer', ['-:Soup']], // broth mixed in on the spot: no line of its own
    ]);
    expect(p.pantry.map(l => l.name)).toEqual(['Water']);
  });
});
