import { draftLineOz, resolveItem } from '../src/core/editLines';
import type { Catalog } from '../src/core/planner';
import type { DraftLine } from '../src/lib/recipes';

const catalog: Catalog = {
  ingredients: [
    { id: 'onion', name: 'Yellow onion', yield: 0.9, yieldSource: 'estimate', gramsPerCup: 160 },
    { id: 'water', name: 'Water', yield: 1, yieldSource: 'kitchen' },
  ],
  recipes: [{ id: 'broth', name: 'Chicken Broth', method: 'no-cook', lines: [{ ingredientId: 'water', oz: 8.5 }] }],
  menu: [],
  sides: {},
};
const line = (p: Partial<DraftLine>): DraftLine =>
  ({ amount: 1, unit: 'cup', name: '', note: '', ingredientId: 'onion', recipeId: null, oz: null, ...p });

describe('recipe editor lines', () => {
  it('links a typed name to an ingredient or to another recipe', () => {
    expect(resolveItem(' yellow ONION ', catalog)).toEqual({ ingredientId: 'onion', recipeId: null });
    expect(resolveItem('Chicken Broth', catalog)).toEqual({ ingredientId: null, recipeId: 'broth' });
    expect(resolveItem('dragon fruit', catalog)).toEqual({ ingredientId: null, recipeId: null });
  });

  it('keeps the weight of a line nobody changed, works out a changed one', () => {
    const before = line({ oz: 6.27 });
    expect(draftLineOz({ ...before }, before, catalog)).toBe(6.27);
    expect(draftLineOz({ ...before, amount: 2 }, before, catalog)).toBeCloseTo(2 * 160 / 28.3495 / 0.9, 6);
  });

  it('counts sub-recipe lines in batches of that recipe, or by weight', () => {
    expect(draftLineOz(line({ ingredientId: null, recipeId: 'broth', amount: 3, unit: 'batches' }), undefined, catalog)).toBeCloseTo(25.5, 9);
    expect(draftLineOz(line({ ingredientId: null, recipeId: 'broth', amount: 2, unit: 'lb' }), undefined, catalog)).toBe(32);
    expect(draftLineOz(line({ ingredientId: null, recipeId: 'broth', amount: 2, unit: 'cups' }), undefined, catalog)).toBeNull();
  });
});
