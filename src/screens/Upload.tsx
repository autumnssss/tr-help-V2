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
  }
}

const dates = (orders: OrderLine[]) =>
  [...new Set(orders.map(o => o.windowStart.slice(0, 10)).filter(Boolean))].sort();

export function Upload({ catalog }: { catalog: Catalog }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  async function read(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      const orders = parseHotplateCsv(await file.text());
      if (!orders.length) throw new Error('That file has no order lines.');
      setLoaded({ fileName: file.name, orders, result: plan(orders, catalog) });
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
                    {g.items.map(i => (
                      <tr key={i.recipeId}><td>{i.name}</td><td className="num">{i.finishedLb.toFixed(2)} lb</td></tr>
                    ))}
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
