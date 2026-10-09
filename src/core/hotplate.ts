// Hotplate prep-list CSV importer.

export type OrderLine = {
  windowStart: string;
  item: string;
  variation: string;
  quantity: number;
  remaining: number;
};

export type SidePick = { name: string; count: number };

/** RFC 4180 CSV: quoted fields may contain commas, quotes ("") and newlines. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  const src = text.replace(/^﻿/, '');

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"' && src[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field); field = '';
      rows.push(row); row = [];
    } else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim() !== ''));
}

const REQUIRED = ['Window Start', 'Item Title', 'Variation', 'Quantity', 'Remaining'] as const;

export function parseHotplateCsv(text: string): OrderLine[] {
  const [header, ...rows] = parseCsv(text);
  if (!header) return [];
  const col = Object.fromEntries(header.map((h, i) => [h.trim(), i]));
  const missing = REQUIRED.filter(c => col[c] === undefined);
  if (missing.length) throw new Error(`Not a Hotplate prep list: missing column(s) ${missing.join(', ')}`);

  const get = (r: string[], c: (typeof REQUIRED)[number]) => (r[col[c]!] ?? '').trim();
  return rows.map(r => ({
    windowStart: get(r, 'Window Start'),
    item: get(r, 'Item Title'),
    variation: get(r, 'Variation'),
    quantity: Number(get(r, 'Quantity')) || 0,
    remaining: Number(get(r, 'Remaining')) || 0,
  }));
}

/** "Potato Salad • 2x Honey Glazed Carrots" → [{Potato Salad,1},{Honey Glazed Carrots,2}] */
export function parseSidePicks(variation: string): SidePick[] {
  return variation
    .split('•')
    .map(s => s.trim())
    .filter(Boolean)
    .map(s => {
      const m = s.match(/^(\d+)\s*x\s+(.+)$/i);
      return m ? { name: m[2]!.trim(), count: Number(m[1]) } : { name: s, count: 1 };
    });
}

/** Normalize a title for matching: trim, lowercase, collapse spaces, drop "- Menu X". */
export function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\s*-\s*menu\s+[a-z]$/, '');
}
