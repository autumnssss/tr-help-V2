import { readFileSync } from 'node:fs';
import { normalizeName, parseHotplateCsv, parseSidePicks } from '../src/core/hotplate';

const fixture = readFileSync(new URL('./fixtures/hotplate-prep-list-2026-10-08.csv', import.meta.url), 'utf8');

describe('parseHotplateCsv on the real prep list', () => {
  const lines = parseHotplateCsv(fixture);

  it('reads every order row, including multi-line quoted descriptions', () => {
    expect(lines).toHaveLength(17);
    expect(lines.reduce((s, l) => s + l.quantity, 0)).toBe(47);
  });

  it('trims titles and keeps variations', () => {
    expect(lines).toContainEqual({
      windowStart: '2026-10-13 00:00:00',
      item: 'Broccoli Cheddar Soup',
      variation: '24 ounces',
      quantity: 1,
      remaining: 1,
    });
    expect(lines.filter(l => l.item === 'Garden Vegetable and Sides - Menu E')).toHaveLength(4);
  });

  it('rejects a file that is not a prep list', () => {
    expect(() => parseHotplateCsv('Name,Email\nA,b@c.com\n')).toThrow(/missing column/);
  });
});

describe('parseSidePicks', () => {
  it('splits sides and counts 2x picks', () => {
    expect(parseSidePicks('Potato Salad • 2x Honey Glazed Carrots')).toEqual([
      { name: 'Potato Salad', count: 1 },
      { name: 'Honey Glazed Carrots', count: 2 },
    ]);
  });
});

describe('normalizeName', () => {
  it('ignores case, extra spaces and the menu letter', () => {
    expect(normalizeName('  Garden Vegetable and Sides - Menu E ')).toBe('garden vegetable and sides');
    expect(normalizeName('Smoked Beef by the pound ')).toBe('smoked beef by the pound');
  });
});
