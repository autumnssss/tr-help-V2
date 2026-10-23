import { labelRound, mealPanels, pad, recipeMacrosPerOz } from '../src/core/nutrition';
import type { Catalog } from '../src/core/planner';

// Test values only (not real food data): chosen so the arithmetic is easy to check by code.
const catalog = {
  ingredients: [
    { id: 'meat', name: 'meat', yield: 0.5, yieldSource: 'estimate', nutrition: { kcal: 200, protein: 30, carbs: 0, fat: 8, basis: 'cooked' } },
    { id: 'rice', name: 'rice', yield: 3, yieldSource: 'estimate', nutrition: { kcal: 350, protein: 7, carbs: 80, fat: 1, basis: 'raw' } },
    { id: 'salt', name: 'salt', yield: 1, yieldSource: 'estimate' }, // no data yet
  ],
  recipes: [
    { id: 'm', name: 'Meat', method: 'smoke', lines: [{ ingredientId: 'meat', oz: 32 }] }, // 16 oz cooked
    { id: 'r', name: 'Rice', method: 'boil', lines: [{ ingredientId: 'rice', oz: 16 }] }, // 48 oz cooked
    { id: 's', name: 'Salty', method: 'boil', lines: [{ ingredientId: 'salt', oz: 1 }] },
  ],
  menu: [
    { id: 'plate', titles: ['Meat & Rice'], kind: 'meal', sizes: { regular: { portions: [{ recipeId: 'm', oz: 4 }, { recipeId: 'r', oz: 4 }], packaging: [], labels: 1 } } },
    { id: 'salty', titles: ['Salty Plate'], kind: 'meal', sizes: { regular: { portions: [{ recipeId: 's', oz: 4 }], packaging: [], labels: 1 } } },
  ],
  sides: {},
} as unknown as Catalog;

describe('nutrition', () => {
  it('cooked-basis data counts the finished weight; raw-basis counts what was bought', () => {
    const meat = recipeMacrosPerOz(catalog, 'm');
    // 32 oz bought × 0.5 yield = 16 oz cooked → per oz = 200 kcal per 100 g × 28.3495 g / 100
    expect('perOz' in meat && meat.perOz.kcal).toBeCloseTo(2 * 28.3495, 6);
    const rice = recipeMacrosPerOz(catalog, 'r');
    // 16 oz dry × 350 per 100 g, spread over 48 oz cooked
    expect('perOz' in rice && rice.perOz.kcal).toBeCloseTo((16 * 28.3495 * 3.5) / 48, 6);
  });

  it('adds up the regular plate', () => {
    const [panel] = mealPanels(catalog);
    expect(panel?.title).toBe('Meat & Rice');
    expect(panel && 'servingOz' in panel && panel.servingOz).toBe(8);
    const meat = recipeMacrosPerOz(catalog, 'm') as { perOz: { protein: number } };
    const rice = recipeMacrosPerOz(catalog, 'r') as { perOz: { protein: number } };
    expect(panel && 'macros' in panel && panel.macros.protein).toBeCloseTo(4 * meat.perOz.protein + 4 * rice.perOz.protein, 9);
  });

  it('never guesses: an ingredient with no data is listed and the meal has no panel', () => {
    const salty = mealPanels(catalog).find(p => p.title === 'Salty Plate');
    expect(salty).toEqual({ id: 'salty', title: 'Salty Plate', missing: ['salt'] });
  });

  it('leaves out meals that already have their own label', () => {
    const own = { ...catalog, menu: catalog.menu.map(m => (m.id === 'salty' ? { ...m, ownLabel: true } : m)) } as Catalog;
    expect(mealPanels(own).map(p => p.title)).toEqual(['Meat & Rice']);
  });

  it('pads, then rounds the way US labels do', () => {
    expect(pad({ kcal: 100, protein: 10, carbs: 20, fat: 5 }, { kcal: 0.1, protein: 0, carbs: 0.1, fat: 0.1 }))
      .toEqual({ kcal: 110.00000000000001, protein: 10, carbs: 22, fat: 5.5 });
    expect(labelRound({ kcal: 446, protein: 31.6, carbs: 0.7, fat: 4.3 })).toEqual({ kcal: '450', protein: '32 g', carbs: '<1 g', fat: '4.5 g' });
    expect(labelRound({ kcal: 47, protein: 0.2, carbs: 12.5, fat: 0.3 })).toEqual({ kcal: '45', protein: '0 g', carbs: '13 g', fat: '0 g' });
    expect(labelRound({ kcal: 3, protein: 1, carbs: 1, fat: 12.4 })).toEqual({ kcal: '0', protein: '1 g', carbs: '1 g', fat: '12 g' });
  });
});
