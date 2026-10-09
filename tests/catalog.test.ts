import { rowsToCatalog, type CatalogRows } from '../src/lib/catalog';
import { plan } from '../src/core/planner';
import type { OrderLine } from '../src/core/hotplate';

const order = (item: string, quantity: number, variation = ''): OrderLine =>
  ({ windowStart: '2026-10-13 00:00:00', item, variation, quantity, remaining: quantity });

// Shaped like PostgREST output (numeric columns may arrive as strings).
const rows: CatalogRows = {
  ingredients: [
    { id: 'i-pork', name: 'pork butt', yield: 0.5, yield_source: 'kitchen', buffer: 0, purchase_unit: null, purchase_oz: null },
    { id: 'i-carrot', name: 'carrots', yield: '0.8' as unknown as number, yield_source: 'usda', buffer: 0.25, purchase_unit: '10 lb case', purchase_oz: 160 },
  ],
  kitchen_recipes: [
    { id: 'r-pork', name: 'Smoked pork', method: 'smoke', finished_oz: null },
    { id: 'r-carrot', name: 'Glazed carrots', method: null, finished_oz: null },
  ],
  recipe_lines: [
    { recipe_id: 'r-pork', ingredient_id: 'i-pork', sub_recipe_id: null, raw_name: 'pork butt', oz: 16, position: 0 },
    { recipe_id: 'r-carrot', ingredient_id: 'i-carrot', sub_recipe_id: null, raw_name: 'carrots', oz: 16, position: 0 },
  ],
  container_types: [
    { id: 'c-div', name: '24 oz divided', cost_only: false },
    { id: 'c-wrap', name: 'Plastic wrap', cost_only: true },
  ],
  menu_items: [
    { id: 'm-pork', name: 'Mississippi Pork Roast', kind: 'meal', side_oz: null },
    { id: 'm-garden', name: 'Garden Vegetable and Sides', kind: 'sidePlate', side_oz: 4 },
  ],
  menu_titles: [{ menu_item_id: 'm-pork', title: 'Pork Roast - Menu B' }],
  menu_sizes: [
    { id: 's-reg', menu_item_id: 'm-pork', variation: 'regular', labels: 1 },
    { id: 's-fam', menu_item_id: 'm-pork', variation: 'Family', labels: 3 },
    { id: 's-garden', menu_item_id: 'm-garden', variation: 'regular', labels: 1 },
  ],
  size_portions: [
    { size_id: 's-reg', recipe_id: 'r-pork', oz: 4 },
    { size_id: 's-reg', recipe_id: 'r-carrot', oz: 4 },
    { size_id: 's-fam', recipe_id: 'r-pork', oz: 16 },
  ],
  size_packaging: [
    { size_id: 's-reg', container_id: 'c-div', qty: 1 },
    { size_id: 's-reg', container_id: 'c-wrap', qty: 1 },
    { size_id: 's-garden', container_id: 'c-div', qty: 1 },
  ],
  side_links: [{ side_name: 'Honey Glazed Carrots', recipe_id: 'r-carrot' }],
};

describe('database rows → plan', () => {
  const p = plan([
    order('Mississippi Pork Roast', 4),
    order('Pork Roast - Menu B', 1, 'Family'),
    order('Garden Vegetable and Sides', 2, '2x Honey Glazed Carrots'),
  ], rowsToCatalog(rows));

  it('resolves names, aliases, sizes and sides', () => {
    expect(p.unresolved).toEqual([]);
  });

  it('computes the shopping list from yields, buffers and package sizes', () => {
    // pork: (4×4 + 16) oz finished ÷ 0.5 = 64 oz = 4 lb
    expect(p.shoppingList.find(l => l.name === 'pork butt')).toMatchObject({ lb: 4 });
    // carrots: (4×4 + 2×8) oz finished ÷ 0.8 × 1.25 = 50 oz → 1 case
    expect(p.shoppingList.find(l => l.name === 'carrots')).toMatchObject({ oz: 50, packages: { count: 1, unit: '10 lb case' } });
  });

  it('labels by menu name, skips cost-only packaging, groups unset methods', () => {
    expect(p.labels).toEqual([
      { title: 'Mississippi Pork Roast', count: 7 },
      { title: 'Garden Vegetable and Sides', count: 2 },
    ]);
    expect(p.containers).toEqual([{ container: '24 oz divided', count: 6 }]);
    expect(p.prepSheet.map(g => g.method)).toEqual(['smoke', 'unassigned']);
  });
});
