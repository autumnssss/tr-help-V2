import { lineOz, missingWeight, unitKind, lbOz, buyAmount } from '../src/core/measure';

describe('recipe line weights', () => {
  it('converts weights exactly', () => {
    expect(lineOz(2, 'lb', undefined)).toBe(32);
    expect(lineOz(8, 'oz', undefined)).toBe(8);
    expect(lineOz(453.592, 'g', undefined)).toBeCloseTo(16, 3);
  });

  it('uses the weight per cup for cups and spoons, divided by yield (measured prepped, bought whole)', () => {
    const onion = { yield: 0.9, gramsPerCup: 160 };
    expect(lineOz(1, 'cup', onion)).toBeCloseTo(160 / 28.3495 / 0.9, 6);
    expect(lineOz(16, 'tbsp', onion)).toBeCloseTo(lineOz(1, 'cup', onion)!, 9);
    expect(lineOz(3, 'tsp', onion)).toBeCloseTo(lineOz(1, 'tbsp', onion)!, 9);
    expect(lineOz(1, 'T', onion)).toBeCloseTo(lineOz(1, 'tbsp', onion)!, 9); // capital T = tablespoon
    expect(lineOz(1, 't', onion)).toBeCloseTo(lineOz(1, 'tsp', onion)!, 9); // small t = teaspoon
  });

  it('counts by the package it is bought in, else weight per each', () => {
    expect(lineOz(2, 'cans', { yield: 1, purchase: { unit: 'cans (15 oz)', oz: 15 } })).toBe(30);
    expect(lineOz(2, 'can', { yield: 1, purchase: { unit: 'cans', oz: 15 } })).toBe(30);
    expect(lineOz(3, 'cloves', { yield: 0.87, gramsPerEach: 3 })).toBeCloseTo(9 / 28.3495, 6);
  });

  it('never guesses: no weight per cup or each → null, and says which one to ask for', () => {
    expect(lineOz(1, 'cup', { yield: 1 })).toBeNull();
    expect(lineOz(1, '', { yield: 1 })).toBeNull();
    expect(lineOz(null, 'lb', undefined)).toBeNull();
    expect(missingWeight('Tbsp.')).toBe('cup');
    expect(missingWeight('cloves')).toBe('each');
    expect(missingWeight('lb')).toBeNull();
    expect(unitKind('fl oz')).toBe('volume');
  });
});

describe('weights as the kitchen reads them', () => {
  it('a pound or more in pounds and whole ounces; under a pound in ounces', () => {
    expect(lbOz(20)).toBe('1 lb 4 oz');
    expect(lbOz(32)).toBe('2 lb');
    expect(lbOz(30.08)).toBe('1 lb 14 oz');
    expect(lbOz(10.9)).toBe('10.9 oz');
    expect(lbOz(0.35)).toBe('0.35 oz');
  });
  it('rounds up when buying, never short', () => {
    expect(lbOz(30.08, true)).toBe('1 lb 15 oz');
    expect(lbOz(31.6, true)).toBe('2 lb');
    expect(lbOz(32, true)).toBe('2 lb');
  });
});

describe('what the shopping list says to buy', () => {
  it('pasta, grains and loose items by weight', () => {
    expect(buyAmount(8, undefined)).toBe('8.0 oz');
    expect(buyAmount(20, {})).toBe('1 lb 4 oz');
  });
  it('packages as the part needed, not rounded up', () => {
    expect(buyAmount(48.75, { purchase: { unit: 'cans', oz: 15 } })).toBe('3.25 cans');
    expect(buyAmount(65, { purchase: { unit: 'cans', oz: 15 } })).toBe('4.33 cans');
    expect(buyAmount(5, { purchase: { unit: 'bags (10 oz)', oz: 10 } })).toBe('½ bag (10 oz)');
    expect(buyAmount(30, { purchase: { unit: 'cans', oz: 15 } })).toBe('2 cans');
  });
  it('liquids in cups with the part of a quart', () => {
    expect(buyAmount(8.1, { purchase: { unit: 'quarts', oz: 33.581 } })).toBe('1 cup (¼ quart)');
    expect(buyAmount(25, { purchase: { unit: 'quarts', oz: 33.581 } })).toBe('3 cups (¾ quart)');
  });
  it('garlic in cloves, with the part of a head', () => {
    expect(buyAmount(0.635, { purchase: { unit: 'heads', oz: 2 }, gramsPerEach: 3, eachUnit: 'cloves' })).toBe('6 cloves (⅓ head)');
  });
});

describe('things bought one at a time', () => {
  it('rounds eggs, limes and chickens up to whole ones; spoon-sized packages stay as they are', () => {
    expect(buyAmount(6.64, { purchase: { unit: 'eggs', oz: 2 } })).toBe('4 eggs');
    expect(buyAmount(32.4 * 0.99, { purchase: { unit: 'chickens', oz: 72 } })).toBe('1 chicken');
    expect(buyAmount(1.56, { purchase: { unit: 'tsp', oz: 0.21 } })).toBe('7.43 tsp');
  });
});
