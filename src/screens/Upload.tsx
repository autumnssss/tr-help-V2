import { useMemo, useState, type DragEvent } from 'react';
import { parseHotplateCsv, type OrderLine } from '../core/hotplate';
import { labelsByDestination, type LabelsByDestination } from '../core/labels';
import { parseTickets } from '../core/tickets';
import { pdfTextItems } from '../lib/pdf';
import { plan, type Catalog, type Plan, type RecipeCard, type ShoppingLine, type Unresolved } from '../core/planner';
import { Card } from '../components/RecipeCard';
import { containsOrders, sameOrders, subtractOrders } from '../core/weeks';
import { normalizeName } from '../core/hotplate';

/** A saved upload, so the next file can take out orders it already counted. */
export type PastUpload = { fileName: string; uploadedAt: string; lines: OrderLine[] };
export type UploadHistory = {
  recent(): Promise<PastUpload[]>;
  save(fileName: string, lines: OrderLine[]): Promise<void>;
};

type Loaded = { fileName: string; raw: OrderLine[]; previous?: PastUpload };

const METHOD_LABEL: Record<string, string> = {
  smoke: 'Smoke', braise: 'Braise', boil: 'Boil', simmer: 'Simmer', grill: 'Grill', roast: 'Roast',
  saute: 'Sauté', bake: 'Bake', 'no-cook': 'No-cook',
};

function describe(u: Unresolved, recipeName: (id: string) => string): string {
  switch (u.kind) {
    case 'item': return `Menu item not set up: “${u.title}”`;
    case 'size': return `“${u.title}”: size “${u.variation}” not set up`;
    case 'side': return `“${u.title}”: side “${u.side}” not linked to a recipe`;
    case 'recipe': return `Recipe missing or has no finished weight: ${recipeName(u.recipeId)}`;
    case 'ingredient': return `${recipeName(u.recipeId)}: “${u.ingredient}” not linked to a library ingredient`;
    case 'weight': return `${recipeName(u.recipeId)}: “${u.ingredient}” has no weight (needs weight per cup)`;
    case 'pieces': return `${recipeName(u.recipeId)}: portion is in pieces but no weight per piece is set`;
    case 'cycle': return `${recipeName(u.recipeId)} is used inside itself (recipe loop)`;
    case 'station': return `${recipeName(u.recipeId)} (${u.lb.toFixed(2)} lb) has no station, so it's on no station's prep list. Set its cooking method.`;
  }
}

/** Report sections each device can show or hide (Needs setup always shows). Saved on this device only. */
const SECTIONS = [
  ['totals', 'Totals by item'], ['shopping', 'Shopping list'], ['prep', 'Prep sheet'], ['bakery', 'Bakery'],
  ['destinations', 'Labels by destination'], ['labels', 'Labels'], ['containers', 'Containers'],
] as const;
type SectionId = typeof SECTIONS[number][0];
const HIDDEN_KEY = 'report-hidden-sections';
const loadHidden = (): Set<SectionId> => {
  try { return new Set(JSON.parse(localStorage.getItem(HIDDEN_KEY) ?? '[]') as SectionId[]); } catch { return new Set(); }
};

const fmtOz = (oz: number) => `${Number.isInteger(oz) ? oz : oz.toFixed(1)} oz`;

/** Counted items read as a count ("7 eggs", "3 packs"); everything else as weight. */
const amount = (l: ShoppingLine) => (l.packages ? `${l.packages.count} ${l.packages.unit}` : weight(l.oz));

/** Under a pound reads better in ounces (garlic 0.2 oz, not 0.01 lb). */
const weight = (oz: number) => (oz < 16 ? `${oz < 1 ? oz.toFixed(2) : oz.toFixed(1)} oz` : `${(oz / 16).toFixed(2)} lb`);

const dates = (orders: OrderLine[]) =>
  [...new Set(orders.map(o => o.windowStart.slice(0, 10)).filter(Boolean))].sort();

export function Upload({ catalog, history }: { catalog: Catalog; history?: UploadHistory }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [hidden, setHidden] = useState<Set<SectionId>>(loadHidden);
  const show = (id: SectionId) => !hidden.has(id);
  function toggleSection(id: SectionId) {
    const next = new Set(hidden);
    if (next.has(id)) next.delete(id); else next.add(id);
    setHidden(next);
    try { localStorage.setItem(HIDDEN_KEY, JSON.stringify([...next])); } catch { /* private mode */ }
  }
  const [subtract, setSubtract] = useState(true);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const itemKey = (item: string) => normalizeName(item);
  const orders = useMemo(() => {
    if (!loaded) return [];
    const base = subtract && loaded.previous ? subtractOrders(loaded.raw, loaded.previous.lines) : loaded.raw;
    return base.filter(o => !excluded.has(itemKey(o.item)));
  }, [loaded, subtract, excluded]);
  const result: Plan | undefined = useMemo(() => (loaded ? plan(orders, catalog) : undefined), [loaded, orders, catalog]);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [openCard, setOpenCard] = useState<string | null>(null);
  const [tickets, setTickets] = useState<{ fileName: string; labels: LabelsByDestination } | null>(null);
  const [ticketError, setTicketError] = useState<string | null>(null);
  async function readTickets(file: File | undefined) {
    if (!file) return;
    setTicketError(null);
    try {
      const parsed = parseTickets(await pdfTextItems(file));
      if (!parsed.length) throw new Error('No Hotplate tickets found in that PDF.');
      setTickets({ fileName: file.name, labels: labelsByDestination(parsed, catalog) });
    } catch (e) {
      setTickets(null);
      setTicketError(e instanceof Error ? e.message : String(e));
    }
  }
  const cardToggle = (recipeId: string | undefined) =>
    recipeId && result?.recipeCards[recipeId]
      ? <button className="btn link small no-print" onClick={() => setOpenCard(openCard === recipeId ? null : recipeId)}>{openCard === recipeId ? 'Hide recipe' : 'Recipe'}</button>
      : null;
  const cardRow = (key: string, recipeId: string | undefined) =>
    recipeId && openCard === recipeId && result?.recipeCards[recipeId]
      ? [<tr key={`card:${key}`} className="card-row"><td /><td colSpan={2}><Card card={result!.recipeCards[recipeId]!} cards={result!.recipeCards} /></td></tr>]
      : [];

  // Ticks on the prep sheet survive a refresh on this device, per uploaded file.
  const doneKey = (fileName: string) => `prep-done:${fileName}`;
  const loadDone = (fileName: string) => {
    try { return new Set<string>(JSON.parse(localStorage.getItem(doneKey(fileName)) ?? '[]')); } catch { return new Set<string>(); }
  };
  const toggle = (id: string) => {
    if (!loaded) return;
    const next = new Set(done);
    if (next.has(id)) next.delete(id); else next.add(id);
    setDone(next);
    try { localStorage.setItem(doneKey(loaded.fileName), JSON.stringify([...next])); } catch { /* private mode */ }
  };
  const box = (id: string, label: string) => (
    <input type="checkbox" aria-label={`Done: ${label}`} checked={done.has(id)} onChange={() => toggle(id)} />
  );
  const check = (id: string, label: string, inline = false) =>
    inline ? box(id, label) : <td className="check">{box(id, label)}</td>;

  async function read(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      const raw = parseHotplateCsv(await file.text());
      if (!raw.length) throw new Error('That file has no order lines.');
      // The most recent earlier upload that this file still contains (Hotplate keeps old weeks in).
      const recent = history ? await history.recent().catch(() => []) : [];
      const previous = recent.find(u => !sameOrders(u.lines, raw) && containsOrders(raw, u.lines));
      if (history && !(recent[0] && sameOrders(recent[0].lines, raw))) await history.save(file.name, raw).catch(() => undefined);
      setLoaded({ fileName: file.name, raw, ...(previous ? { previous } : {}) });
      setSubtract(true);
      setExcluded(new Set());
      setDone(loadDone(file.name));
    } catch (e) {
      setLoaded(null);
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    void read(e.dataTransfer.files[0]);
  };

  const recipeName = (id: string) => catalog.recipes.find(r => r.id === id)?.name ?? id;
  const r = result;
  const totalLabels = r?.labels.reduce((s, l) => s + l.count, 0) ?? 0;
  const totalPlates = orders.reduce((s, o) => s + o.quantity, 0);
  const fileItems = loaded
    ? [...new Map((subtract && loaded.previous ? subtractOrders(loaded.raw, loaded.previous.lines) : loaded.raw)
        .map(o => [itemKey(o.item), o.item.trim()])).entries()]
    : [];
  const toggleItem = (k: string) => {
    const next = new Set(excluded);
    if (next.has(k)) next.delete(k); else next.add(k);
    setExcluded(next);
  };

  return (
    <main>
      <section
        className={`drop no-print${dragging ? ' dragging' : ''}`}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <p><strong>Drop the Hotplate prep-list CSV here</strong></p>
        <label className="btn">
          Choose file
          <input type="file" accept=".csv,text/csv" hidden onChange={e => { void read(e.target.files?.[0]); e.target.value = ''; }} />
        </label>
        {error && <p className="error">{error}</p>}
      </section>

      {loaded && r && (
        <>
          <section className="summary">
            <h2>{loaded.fileName}</h2>
            <p className="muted">
              {orders.length} lines · {totalPlates} items ordered · order dates {dates(orders).join(', ')}
            </p>
            <button className="btn no-print" onClick={() => window.print()}>Print</button>
          </section>

          {loaded.previous && (
            <section className="card no-print">
              <label className="toggle">
                <input type="checkbox" checked={subtract} onChange={e => setSubtract(e.target.checked)} />
                <span>
                  <strong>Leave out last upload's orders</strong>
                  <div className="raw">
                    This file still has everything from “{loaded.previous.fileName}”
                    ({new Date(loaded.previous.uploadedAt).toLocaleDateString()}). Hotplate keeps earlier weeks in the prep list.
                  </div>
                </span>
              </label>
            </section>
          )}

          <details className="card no-print items">
            <summary>Show on this page ({SECTIONS.length - SECTIONS.filter(([id]) => hidden.has(id)).length} of {SECTIONS.length} sections)</summary>
            <p className="raw">Saved on this device, so each person can keep their own view. Hidden sections don't print.</p>
            {SECTIONS.map(([id, name]) => (
              <label key={id} className="toggle">
                <input type="checkbox" checked={show(id)} onChange={() => toggleSection(id)} />
                <span>{name}</span>
              </label>
            ))}
          </details>

          <details className="card no-print items">
            <summary>Items in this file ({fileItems.length - [...excluded].filter(k => fileItems.some(([fk]) => fk === k)).length} of {fileItems.length} counted)</summary>
            {fileItems.map(([k, name]) => (
              <label key={k} className="toggle">
                <input type="checkbox" checked={!excluded.has(k)} onChange={() => toggleItem(k)} />
                <span>{name}</span>
              </label>
            ))}
          </details>

          {!r.complete && (
            <section className="card warn">
              <h3>Needs setup ({r.unresolved.length})</h3>
              <p>Each of these is missing from at least one list below (shopping, prep or labels) until it's set up.</p>
              <ul>{r.unresolved.map((u, i) => <li key={i}>{describe(u, recipeName)}</li>)}</ul>
            </section>
          )}

          {show('totals') && <section className="card">
            <h3>Totals by item</h3>
            <p className="muted">Every portion sold (Quantity) × how many = total cooked weight.</p>
            {r.components.filter(c => c.portions.length).length === 0 ? <p className="muted">Nothing yet.</p> : (
              <table><tbody>
                {r.components.filter(c => c.portions.length).map(c => (
                  <tr key={c.recipeId}>
                    <td>
                      <strong>{c.name}</strong>
                      <div className="raw">{c.portions.map(p => `${p.label} × ${p.count}`).join(' + ')}</div>
                    </td>
                    <td className="num">{weight(c.finishedOz)}</td>
                  </tr>
                ))}
              </tbody></table>
            )}
          </section>}

          {show('shopping') && <section className="card">
            <h3>Shopping list</h3>
            <p className="muted">As-purchased weight for every meal sold (Quantity), after yield loss and buffer.</p>
            {r.shoppingList.length === 0 ? <p className="muted">Nothing yet.</p> : (
              <table>
                <thead><tr><th className="check" /><th>Ingredient</th><th className="num">Amount</th></tr></thead>
                <tbody>
                  {r.shoppingList.flatMap((l, i) => [
                    ...(i === 0 || r.shoppingList[i - 1]!.category !== l.category
                      ? [<tr key={`cat:${l.category}`} className="aisle"><td colSpan={3}>{l.category}</td></tr>] : []),
                    <tr key={l.ingredientId} className={done.has(`shop:${l.ingredientId}`) ? 'done' : ''}>
                      {check(`shop:${l.ingredientId}`, l.name)}
                      <td>{l.name}</td>
                      <td className="num">{amount(l)}</td>
                    </tr>,
                  ])}
                </tbody>
              </table>
            )}
            {r.pantry.length > 0 && (
              <details className="pantry">
                <summary>From the pantry ({r.pantry.length}) — not on the list, check stock</summary>
                <table><tbody>
                  {r.pantry.map(l => (
                    <tr key={l.ingredientId} className={done.has(`pantry:${l.ingredientId}`) ? 'done' : ''}>
                      {check(`pantry:${l.ingredientId}`, l.name)}<td>{l.name}</td><td className="num">{amount(l)}</td>
                    </tr>
                  ))}
                </tbody></table>
              </details>
            )}
          </section>}

          {show('prep') && <section className="card">
            <h3>Prep sheet</h3>
            <p className="muted">Finished weight still to prep (Remaining), one total per component.</p>
            {r.prepSheet.length === 0 ? <p className="muted">Nothing yet.</p> : r.prepSheet.map(g => (
              <div key={g.method} className="group">
                <h4>{METHOD_LABEL[g.method] ?? g.method}</h4>
                <table>
                  <tbody>
                    {g.items.flatMap((i, n) => {
                      const header = i.group && i.group !== g.items[n - 1]?.group
                        ? [<tr key={`grp:${i.group}`} className="pot"><td colSpan={3}>{i.group}</td></tr>] : [];
                      // Every line: name · amount · what it's for · Recipe (the scaled card has the starting amounts).
                      const rows = [
                        <tr key={i.recipeId} className={done.has(i.recipeId) ? 'done' : ''}>
                          {check(i.recipeId, i.name)}
                          <td>
                            <strong>{i.name}</strong> {cardToggle(i.recipeId)}
                            {i.for.length > 0 && <div className="raw">for {i.for.join(', ')}</div>}
                            {i.pieces && <div className="raw">plate {i.pieces} pieces</div>}
                          </td>
                          <td className="num">{i.finishedLb.toFixed(2)} lb</td>
                        </tr>,
                        ...cardRow(i.recipeId, i.recipeId),
                        // Dishes at this station made from it (Mashed Potatoes from Boiled Russet Potatoes).
                        ...(i.nested ?? []).flatMap(d => {
                          const id = `${i.recipeId}>${d.recipeId}`;
                          return [
                            <tr key={id} className={`used-in${done.has(id) ? ' done' : ''}`}>
                              <td className="check" />
                              <td>
                                <span className="nest">{check(id, d.name, true)}<strong>{d.name}</strong></span> {cardToggle(d.recipeId)}
                                {d.for.length > 0 && <div className="raw">for {d.for.join(', ')}</div>}
                              </td>
                              <td className="num">{d.lb.toFixed(2)} lb</td>
                            </tr>,
                            ...cardRow(id, d.recipeId),
                          ];
                        }),
                      ];
                      return [...header, ...rows];
                    })}
                  </tbody>
                </table>
              </div>
            ))}
          </section>}

          {show('bakery') && r.prepOnly.length > 0 && (
            <section className="card">
              <h3>Bakery (prep only)</h3>
              <p className="muted">Still to make (Remaining). Not on the shopping list.</p>
              <table><tbody>
                {r.prepOnly.map(b => {
                  const id = `bake:${b.title}|${b.variation}`;
                  return (
                    <tr key={id} className={done.has(id) ? 'done' : ''}>
                      {check(id, `${b.title} ${b.variation}`)}
                      <td>{b.title}{b.variation && <div className="raw">{b.variation}</div>}</td>
                      <td className="num">{b.count}</td>
                    </tr>
                  );
                })}
              </tbody></table>
            </section>
          )}

          {show('destinations') && <section className="card">
            <h3>Labels by destination</h3>
            <div className="no-print">
              <p className="muted">Drop the Hotplate ticket PDF to split labels into Bounce &amp; Play, Elevate and Deliveries.</p>
              <label className="btn">
                Choose ticket PDF
                <input type="file" accept=".pdf,application/pdf" hidden onChange={e => { void readTickets(e.target.files?.[0]); e.target.value = ''; }} />
              </label>
              {ticketError && <p className="error">{ticketError}</p>}
            </div>
            {tickets && <DestinationTable fileName={tickets.fileName} labels={tickets.labels} prepList={r.labels} />}
          </section>}

          <div className="two-col">
            {show('labels') && <section className="card">
              <h3>Labels <span className="muted">({totalLabels})</span></h3>
              {r.labels.length === 0 ? <p className="muted">Nothing yet.</p> : (
                <table><tbody>
                  {r.labels.map(l => <tr key={l.title}><td>{l.title}</td><td className="num">{l.count}</td></tr>)}
                </tbody></table>
              )}
            </section>}
            {show('containers') && <section className="card">
              <h3>Containers</h3>
              {r.containers.length === 0 ? <p className="muted">Nothing yet.</p> : (
                <table><tbody>
                  {r.containers.map(c => <tr key={c.container}><td>{c.container}</td><td className="num">{c.count}</td></tr>)}
                </tbody></table>
              )}
            </section>}
          </div>
        </>
      )}
    </main>
  );
}

/** Labels per meal and destination, by size. Family counts labels (3 per family order). */
function DestinationTable({ fileName, labels, prepList }: {
  fileName: string; labels: LabelsByDestination; prepList: { title: string; count: number }[];
}) {
  const fromPrep = new Map(prepList.map(l => [l.title, l.count]));
  // The tickets and the prep list should agree; if not, say where (a different day, an edited order…).
  const differ = [...new Set([...fromPrep.keys(), ...labels.meals.map(m => m.title)])]
    .map(title => ({ title, tickets: labels.meals.find(m => m.title === title)?.total ?? 0, prep: fromPrep.get(title) ?? 0 }))
    .filter(d => d.tickets !== d.prep);
  const cell = (n: number | undefined) => (n ? n : '');
  return (
    <>
      <p className="muted">{fileName} · {labels.totals.map(t => `${t.destination} ${t.total}`).join(' · ')}</p>
      {(differ.length > 0 || labels.unmatched.length > 0) && (
        <div className="warn">
          {differ.length > 0 && <>
            <strong>Tickets and prep list don't match:</strong>
            <ul>{differ.map(d => <li key={d.title}>{d.title}: tickets {d.tickets}, prep list {d.prep}</li>)}</ul>
          </>}
          {labels.unmatched.length > 0 && <>
            <strong>Not counted (not on the menu, or size not set up):</strong>
            <ul>{labels.unmatched.map((u, i) => <li key={i}>{u.ticket}: {u.item}{u.variation && ` (${u.variation})`}</li>)}</ul>
          </>}
        </div>
      )}
      <table className="dest">
        <thead>
          <tr><th />{labels.columns.map(c => <th key={c} className="num">{c}</th>)}<th className="num">Total</th></tr>
        </thead>
        <tbody>
          {labels.meals.flatMap(m => [
            <tr key={m.title} className="aisle"><td colSpan={labels.columns.length + 1}>{m.title}</td><td className="num">{m.total}</td></tr>,
            ...m.byDestination.map(d => (
              <tr key={`${m.title}|${d.destination}`}>
                <td>{d.destination}</td>
                {labels.columns.map(c => <td key={c} className="num">{cell(d.counts[c])}</td>)}
                <td className="num">{d.total}</td>
              </tr>
            )),
          ])}
        </tbody>
      </table>
    </>
  );
}
