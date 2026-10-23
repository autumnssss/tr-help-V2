import { lineOz, missingWeight, unitKind, lbOz } from '../src/core/measure';

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
