import { useState, type DragEvent } from 'react';
import { parseHotplateCsv, type OrderLine } from '../core/hotplate';
import { plan, type Catalog, type Plan, type RecipeCard, type ShoppingLine, type Unresolved } from '../core/planner';
import { formatAmount, formatOz } from '../core/units';

type Loaded = { fileName: string; orders: OrderLine[]; result: Plan };

const METHOD_LABEL: Record<string, string> = {
  smoke: 'Smoke', braise: 'Braise', boil: 'Boil', simmer: 'Simmer', grill: 'Grill', roast: 'Roast',
  saute: 'Sauté', bake: 'Bake', 'no-cook': 'No-cook', unassigned: 'Cooking method not set',
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
  }
}

const fmtOz = (oz: number) => `${Number.isInteger(oz) ? oz : oz.toFixed(1)} oz`;

/** Counted items read as a count ("7 eggs", "3 packs"); everything else as weight. */
const amount = (l: ShoppingLine) => (l.packages ? `${l.packages.count} ${l.packages.unit}` : weight(l.oz));

/** Under a pound reads better in ounces (garlic 0.2 oz, not 0.01 lb). */
const weight = (oz: number) => (oz < 16 ? `${oz < 1 ? oz.toFixed(2) : oz.toFixed(1)} oz` : `${(oz / 16).toFixed(2)} lb`);

/** A recipe scaled to this order. Mixed-in sub-recipes (broth) open inside it. */
function Card({ card, cards }: { card: RecipeCard; cards: Record<string, RecipeCard> }) {
  return (
    <div className="card-recipe">
      <div className="muted">× {card.batches} batches → {formatOz(card.finishedOz)} cooked</div>
      <ul>
        {card.lines.map((l, i) => (
          <li key={i}>
            <strong>{l.amount != null ? formatAmount(l.amount, l.unit) : l.oz != null ? formatOz(l.oz) : '—'}</strong> {l.name}
            {l.sub && <Card card={l.sub} cards={cards} />}
          </li>
        ))}
      </ul>
    </div>
  );
}

const dates = (orders: OrderLine[]) =>
  [...new Set(orders.map(o => o.windowStart.slice(0, 10)).filter(Boolean))].sort();

export function Upload({ catalog }: { catalog: Catalog }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [openCard, setOpenCard] = useState<string | null>(null);
  const cardToggle = (recipeId: string | undefined) =>
    recipeId && loaded?.result.recipeCards[recipeId]
      ? <button className="btn link small no-print" onClick={() => setOpenCard(openCard === recipeId ? null : recipeId)}>{openCard === recipeId ? 'Hide recipe' : 'Recipe'}</button>
      : null;
  const cardRow = (key: string, recipeId: string | undefined) =>
    recipeId && openCard === recipeId && loaded?.result.recipeCards[recipeId]
      ? [<tr key={`card:${key}`} className="card-row"><td /><td colSpan={2}><Card card={loaded.result.recipeCards[recipeId]!} cards={loaded.result.recipeCards} /></td></tr>]
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
      const orders = parseHotplateCsv(await file.text());
      if (!orders.length) throw new Error('That file has no order lines.');
      setLoaded({ fileName: file.name, orders, result: plan(orders, catalog) });
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
  const r = loaded?.result;
  const totalLabels = r?.labels.reduce((s, l) => s + l.count, 0) ?? 0;
  const totalPlates = loaded?.orders.reduce((s, o) => s + o.quantity, 0) ?? 0;

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
              {loaded.orders.length} lines · {totalPlates} meals ordered · order dates {dates(loaded.orders).join(', ')}
            </p>
            <button className="btn no-print" onClick={() => window.print()}>Print</button>
          </section>

          {!r.complete && (
            <section className="card warn">
              <h3>Needs setup ({r.unresolved.length})</h3>
              <p>These aren't in the totals below yet. Lists are incomplete until each one is set up.</p>
              <ul>{r.unresolved.map((u, i) => <li key={i}>{describe(u, recipeName)}</li>)}</ul>
            </section>
          )}

          <section className="card">
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
          </section>

          <section className="card">
            <h3>Shopping list</h3>
            <p className="muted">As-purchased weight for every meal sold (Quantity), after yield loss and buffer.</p>
            {r.shoppingList.length === 0 ? <p className="muted">Nothing yet.</p> : (
              <table>
                <thead><tr><th>Ingredient</th><th className="num">Amount</th></tr></thead>
                <tbody>
                  {r.shoppingList.flatMap((l, i) => [
                    ...(i === 0 || r.shoppingList[i - 1]!.category !== l.category
                      ? [<tr key={`cat:${l.category}`} className="aisle"><td colSpan={2}>{l.category}</td></tr>] : []),
                    <tr key={l.ingredientId}>
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
                    <tr key={l.ingredientId}><td>{l.name}</td><td className="num">{amount(l)}</td></tr>
                  ))}
                </tbody></table>
              </details>
            )}
          </section>

          <section className="card">
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
                      // A base recipe reads as the raw ingredient going into the pot.
                      const base = i.raw && i.usedIn;
                      const single = base && i.usedIn!.length === 1 ? i.usedIn![0]! : undefined;
                      const title = base ? `${i.raw!.name} — ${i.raw!.lb.toFixed(2)} lb raw` : i.name;
                      const rows = [
                        <tr key={i.recipeId} className={done.has(i.recipeId) ? 'done' : ''}>
                          {check(i.recipeId, title)}
                          <td>
                            {title}
                            {single && <div className="raw">for {single.name} {cardToggle(single.recipeId)}</div>}
                            {!base && i.raw && <div className="raw">from {i.raw.lb.toFixed(2)} lb raw {i.raw.name}</div>}
                            {i.pieces && <div className="raw">plate {i.pieces} pieces</div>}
                            {cardToggle(i.recipeId)}
                          </td>
                          <td className="num">{base ? '→ ' : ''}{i.finishedLb.toFixed(2)} lb</td>
                        </tr>,
                        ...cardRow(i.recipeId, i.recipeId),
                        ...(single ? cardRow(`${i.recipeId}>single`, single.recipeId) : []),
                        ...(single ? [] : (i.usedIn ?? []).flatMap(u => {
                          const id = `${i.recipeId}>${u.recipeId ?? 'plated'}`;
                          return [
                            <tr key={id} className={`used-in${done.has(id) ? ' done' : ''}`}>
                              <td className="check" />
                              <td><span className="nest">{check(id, `${i.name} for ${u.name}`, true)}for {u.name}</span> {cardToggle(u.recipeId)}</td><td className="num">{u.lb.toFixed(2)} lb</td>
                            </tr>,
                            ...cardRow(id, u.recipeId),
                          ];
                        })),
                      ];
                      return [...header, ...rows];
                    })}
                  </tbody>
                </table>
              </div>
            ))}
          </section>

          {r.prepOnly.length > 0 && (
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

          <div className="two-col">
            <section className="card">
              <h3>Labels <span className="muted">({totalLabels})</span></h3>
              {r.labels.length === 0 ? <p className="muted">Nothing yet.</p> : (
                <table><tbody>
                  {r.labels.map(l => <tr key={l.title}><td>{l.title}</td><td className="num">{l.count}</td></tr>)}
                </tbody></table>
              )}
            </section>
            <section className="card">
              <h3>Containers</h3>
              {r.containers.length === 0 ? <p className="muted">Nothing yet.</p> : (
                <table><tbody>
                  {r.containers.map(c => <tr key={c.container}><td>{c.container}</td><td className="num">{c.count}</td></tr>)}
                </tbody></table>
              )}
            </section>
          </div>
        </>
      )}
    </main>
  );
}
