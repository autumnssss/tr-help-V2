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
    { id: 'salad', name: 'Potato Salad', method: 'no-cook', lines: [{ ingredientId: null, recipeId: 'boiled', oz: 32 }, { ingredientId: 'mayo', oz: 8 }] }, // 40 oz
    { id: 'mash', name: 'Mashed Potatoes', method: 'no-cook', lines: [{ ingredientId: null, recipeId: 'boiled', oz: 32 }, { ingredientId: 'butter', oz: 4 }] }, // 36 oz
  ],
  menu: [one('Ribs', 'salad', 4), one('Meatloaf', 'mash', 9), one('Boiled potato side', 'boiled', 4)],
  sides: {},
};

describe('recipes inside recipes', () => {
  // 25 × 4 oz salad = 100 oz → 80 oz boiled (5 lb); 14 × 9 oz mash = 126 oz → 112 oz boiled (7 lb)
  const p = plan([order('Ribs', 25), order('Meatloaf', 14)], catalog);

  it('totals the shared base recipe with a breakdown of where it goes', () => {
    const boil = p.prepSheet.find(g => g.method === 'boil')!;
    expect(boil.items).toEqual([{
      recipeId: 'boiled', name: 'Boiled Potatoes', finishedLb: 12,
      usedIn: [{ name: 'Mashed Potatoes', lb: 7 }, { name: 'Potato Salad', lb: 5 }],
    }]);
    expect(p.unresolved).toEqual([]);
  });

  it('buys raw ingredients through the sub-recipe', () => {
    const lb = (id: string) => p.shoppingList.find(l => l.ingredientId === id)?.lb;
    expect(lb('potatoes')).toBe(15); // 12 lb boiled ÷ 0.8
    expect(lb('mayo')).toBe(1.25); // 100 oz salad × 8/40
    expect(lb('butter')).toBe(0.88); // 126 oz mash × 4/36 = 14 oz
  });

  it('shows plated-as-is next to the recipes that use it', () => {
    const q = plan([order('Ribs', 25), order('Boiled potato side', 8)], catalog);
    expect(q.prepSheet.find(g => g.method === 'boil')!.items[0]!.usedIn).toEqual([
      { name: 'Plated as is', lb: 2 }, { name: 'Potato Salad', lb: 5 },
    ]);
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
