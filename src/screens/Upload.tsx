import { useState, type DragEvent } from 'react';
import { parseHotplateCsv, type OrderLine } from '../core/hotplate';
import { plan, type Catalog, type Plan, type Unresolved } from '../core/planner';

type Loaded = { fileName: string; orders: OrderLine[]; result: Plan };

const METHOD_LABEL: Record<string, string> = {
  smoke: 'Smoke', braise: 'Braise', boil: 'Boil', grill: 'Grill', roast: 'Roast',
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
    case 'cycle': return `${recipeName(u.recipeId)} is used inside itself (recipe loop)`;
  }
}

const fmtOz = (oz: number) => `${Number.isInteger(oz) ? oz : oz.toFixed(1)} oz`;

const dates = (orders: OrderLine[]) =>
  [...new Set(orders.map(o => o.windowStart.slice(0, 10)).filter(Boolean))].sort();

export function Upload({ catalog }: { catalog: Catalog }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [done, setDone] = useState<Set<string>>(new Set());

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
            <p className="muted">Every portion sold (Quantity) → cooked weight → what to buy.</p>
            {r.components.length === 0 ? <p className="muted">Nothing yet.</p> : r.components.map(c => (
              <div key={c.recipeId} className="component">
                <div className="component-head">
                  <strong>{c.name}</strong>
                  <span className="muted">{c.portions.map(p => `${p.label} ×${p.count}`).join(' · ')}</span>
                </div>
                <div className="component-cooked">= {fmtOz(c.finishedOz)} cooked ({c.finishedLb.toFixed(2)} lb)</div>
                {c.buy.length === 0
                  ? <div className="muted">Buy amount: recipe not fully set up yet</div>
                  : c.buy.map(b => (
                    <div key={b.ingredientId} className="component-buy">
                      Buy {b.packages ? `${b.packages.count} × ${b.packages.unit}` : `${b.lb.toFixed(2)} lb`}
                      {c.buy.length > 1 || b.name !== c.name ? <span className="buy-name"> {b.name}</span> : null}
                      {b.packages && <span className="muted"> ({b.lb.toFixed(2)} lb)</span>}
                    </div>
                  ))}
              </div>
            ))}
          </section>

          <section className="card">
            <h3>Shopping list</h3>
            <p className="muted">As-purchased weight for every meal sold (Quantity), after yield loss and buffer.</p>
            {r.shoppingList.length === 0 ? <p className="muted">Nothing yet.</p> : (
              <table>
                <thead><tr><th>Ingredient</th><th className="num">Lb</th><th className="num">Buy</th></tr></thead>
                <tbody>
                  {r.shoppingList.map(l => (
                    <tr key={l.ingredientId}>
                      <td>{l.name}</td>
                      <td className="num">{l.lb.toFixed(2)}</td>
                      <td className="num">{l.packages ? `${l.packages.count} × ${l.packages.unit}` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
                    {g.items.flatMap(i => [
                      <tr key={i.recipeId} className={done.has(i.recipeId) ? 'done' : ''}>
                        {check(i.recipeId, i.name)}
                        <td>
                          {i.name}
                          {i.raw && <div className="raw">from {i.raw.lb.toFixed(2)} lb raw {i.raw.name}</div>}
                        </td>
                        <td className="num">{i.finishedLb.toFixed(2)} lb</td>
                      </tr>,
                      ...(i.usedIn ?? []).map(u => {
                        const id = `${i.recipeId}>${u.recipeId ?? 'plated'}`;
                        return (
                          <tr key={id} className={`used-in${done.has(id) ? ' done' : ''}`}>
                            <td className="check" />
                            <td><span className="nest">{check(id, `${i.name} for ${u.name}`, true)}{u.name}</span></td><td className="num">{u.lb.toFixed(2)} lb</td>
                          </tr>
                        );
                      }),
                    ])}
                  </tbody>
                </table>
              </div>
            ))}
          </section>

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
