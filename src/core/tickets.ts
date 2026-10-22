// Hotplate ticket PDF (one ticket per order) → orders with where they go. Pure: works on the PDF's text
// items (text + position), so it's testable without a PDF. Loading the PDF lives in lib/pdf.ts.

export type TextItem = { str: string; x: number; y: number; h: number; page: number };
export type TicketLine = { quantity: number; item: string; variation: string };
export type Ticket = { number: string; destination: string; lines: TicketLine[] };

/** Where an order goes, by the kitchen's names (kitchen 2026-10-21). */
export const DESTINATIONS = ['Bounce & Play', 'Elevate', 'Deliveries'] as const;

export function destinationOf(type: 'Pickup' | 'Delivery', where: string): string {
  if (type === 'Delivery') return 'Deliveries';
  if (/bounce/i.test(where)) return 'Bounce & Play';
  if (/elevate/i.test(where)) return 'Elevate';
  return `Pickup: ${where.trim()}`;
}

/**
 * A ticket: "#00344", then "Delivery"/"Pickup" and the address or pickup spot, then items:
 * a quantity ("2") with the item title beside it, and the option (size, sides, flavor) in smaller
 * type under the title. A long title can wrap onto a second line in the same type.
 */
export function parseTickets(items: TextItem[]): Ticket[] {
  const sorted = [...items].filter(i => i.str.trim()).sort((a, b) => a.page - b.page || b.y - a.y || a.x - b.x);
  const rows: TextItem[][] = [];
  for (const i of sorted) {
    const row = rows[rows.length - 1];
    if (row && row[0]!.page === i.page && Math.abs(row[0]!.y - i.y) < 1.5) row.push(i);
    else rows.push([i]);
  }

  const tickets: Ticket[] = [];
  let cur: Ticket | undefined;
  let awaitingDestination = false;
  let last: { line: TicketLine; x: number; h: number } | undefined;
  for (const row of rows) {
    const [first, ...rest] = row;
    const text = (cells: TextItem[]) => cells.map(c => c.str.trim()).join(' ').trim();
    if (/^#\d+$/.test(first!.str.trim())) {
      cur = { number: first!.str.trim(), destination: '', lines: [] };
      tickets.push(cur);
      awaitingDestination = true;
      last = undefined;
      continue;
    }
    if (!cur) continue;
    const kind = first!.str.trim();
    if (awaitingDestination && (kind === 'Pickup' || kind === 'Delivery')) {
      cur.destination = destinationOf(kind, text(rest));
      awaitingDestination = false;
      continue;
    }
    if (awaitingDestination) continue;
    if (/^\d+$/.test(kind) && rest.length) {
      const line = { quantity: Number(kind), item: text(rest), variation: '' };
      cur.lines.push(line);
      last = { line, x: rest[0]!.x, h: rest[0]!.h };
      continue;
    }
    if (last && Math.abs(first!.x - last.x) < 2) {
      if (Math.abs(first!.h - last.h) < 0.5 && !last.line.variation) last.line.item = `${last.line.item} ${text(row)}`;
      else last.line.variation = last.line.variation ? `${last.line.variation} ${text(row)}` : text(row);
      continue;
    }
    last = undefined; // a name, note or anything else ends the item
  }
  return tickets;
}
