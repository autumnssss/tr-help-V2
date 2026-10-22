import { readFileSync } from 'node:fs';
import { parseTickets, type TextItem } from '../src/core/tickets';
import { labelsByDestination } from '../src/core/labels';
import type { Catalog } from '../src/core/planner';

// Hotplate ticket PDF for Tue Oct 27 (12 orders) as text items, customer details replaced.
const items: TextItem[] = JSON.parse(readFileSync(new URL('./fixtures/hotplate-tickets-2026-10-27.json', import.meta.url), 'utf8'));
const tickets = parseTickets(items);

describe('ticket PDF', () => {
  it('reads every order and where it goes, by the kitchen names', () => {
    expect(tickets).toHaveLength(12);
    const count = (d: string) => tickets.filter(t => t.destination === d).length;
    expect([count('Bounce & Play'), count('Elevate'), count('Deliveries')]).toEqual([4, 3, 5]);
  });

  it('matches the prep list for the same day, item by item and size by size', () => {
    const total = new Map<string, number>();
    for (const t of tickets) for (const l of t.lines) {
      const k = `${l.item}|${l.variation.toUpperCase()}`;
      total.set(k, (total.get(k) ?? 0) + l.quantity);
    }
    // Counts from Hotplate's prep list for Oct 27.
    expect(Object.fromEntries(total)).toEqual({
      'Baked Sweet Potato with Brie|': 3,
      'Smoked Beef - by the pound|': 1,
      'Carnitas with Elote and Black Beans|': 8,
      'Carnitas with Elote and Black Beans|6 OZ': 1,
      'Carnitas with Elote and Black Beans|FAMILY SIZE FEED 3-5': 1,
      'Chicken Marsala Pasta with Broccoli|': 13,
      'Chicken Marsala Pasta with Broccoli|6 OZ': 1,
      'Chicken Marsala Pasta with Broccoli|FAMILY SIZE FEED 3-5': 2,
      'Fajita Combo Bowl Beef & Chicken|': 3,
      'Fajita Combo Bowl Beef & Chicken|6 OZ': 2,
      'Fajita Combo Bowl Beef & Chicken|FAMILY': 2,
      'Garden Vegetables and Sides - Menu C|2X ELOTE/MEXICAN STREET CORN • MACARONI & CHEESE': 1,
      'Garden Vegetables and Sides - Menu C|CAULIFLOWER AND PEAS • MACARONI & CHEESE • SWEET POTATOES': 1,
      'Garden Vegetables and Sides - Menu C|MACARONI & CHEESE': 1,
      'Smoked beef with potato salad, Mac & Cheese|': 13,
      'Smoked beef with potato salad, Mac & Cheese|6 0Z': 1,
      'Smoked Cream Cheese|WORCESTERSHIRE & BLACK PEPPER': 1,
      'Sourdough - choose from our most popular flavors|ROASTED GARLIC': 1,
      'Yummy COOKIES!! <j|CHOCOLATE CHIP': 1,
      'Yummy COOKIES!! <j|PEANUT BUTTER': 1,
    });
  });
});

const size = (labels: number) => ({ portions: [], packaging: [], labels });
const meal = (title: string, sizes: Record<string, number>) =>
  ({ id: title, titles: [title], kind: 'meal' as const, sizes: Object.fromEntries(Object.entries(sizes).map(([k, n]) => [k, size(n)])) });
const catalog: Catalog = {
  ingredients: [],
  recipes: [],
  sides: {},
  menu: [
    meal('Chicken Marsala Pasta with Broccoli', { regular: 1, '6 oz': 1, family: 3 }),
    meal('Smoked beef with potato salad, Mac & Cheese', { regular: 1, '6 oz': 1, family: 3 }),
    { id: 'c', titles: ['Yummy COOKIES!!'], kind: 'prepOnly', packaging: [], labels: 1 },
  ],
};

describe('labels by destination', () => {
  const l = labelsByDestination(tickets, catalog);
  const cell = (title: string, dest: string) => l.meals.find(m => m.title === title)?.byDestination.find(d => d.destination === dest)?.counts;

  it('splits each meal by destination and size; Family counts labels (3 per family order)', () => {
    expect(l.columns).toEqual(['Reg', '6 oz', '8 oz', 'Family']);
    expect(cell('Chicken Marsala Pasta with Broccoli', 'Elevate')).toEqual({ Reg: 2, Family: 3 });
    expect(cell('Chicken Marsala Pasta with Broccoli', 'Bounce & Play')).toEqual({ Reg: 8, '6 oz': 1 }); // #343 2, #339 1 + 6 oz 1, #336 1, #334 4
    expect(cell('Chicken Marsala Pasta with Broccoli', 'Deliveries')).toEqual({ Reg: 3, Family: 3 }); // #337 2, #333 1; #344 family
    expect(l.meals.find(m => m.title === 'Chicken Marsala Pasta with Broccoli')?.total).toBe(20); // 16 orders, 2 of them family
  });

  it('reads "6 0Z" (typed with a zero) as 6 oz', () => {
    expect(cell('Smoked beef with potato salad, Mac & Cheese', 'Deliveries')).toEqual({ Reg: 5, '6 oz': 1 });
  });

  it('matches a title whose emoji became stray characters on the ticket', () => {
    expect(l.meals.find(m => m.title === 'Yummy COOKIES!!')?.total).toBe(2);
  });

  it('lists ticket lines the menu does not know instead of dropping them', () => {
    expect(l.unmatched.map(u => u.item)).toContain('Fajita Combo Bowl Beef & Chicken');
  });
});
