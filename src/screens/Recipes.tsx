import { useMemo, useState } from 'react';
import { Card } from '../components/RecipeCard';
import { batchIsEstimate, batchOz, defaultServingOz, recipeCard, STATION_ORDER, type Catalog } from '../core/planner';

const STATION: Record<string, string> = {
  smoke: 'Smoke', bake: 'Bake', roast: 'Roast', braise: 'Braise', boil: 'Boil', simmer: 'Simmer',
  saute: 'Sauté', grill: 'Grill', 'no-cook': 'No-cook', unassigned: 'Cooking method not set',
};

/** Every recipe, scaled to how many servings you need. No order upload required. */
export function Recipes({ catalog }: { catalog: Catalog }) {
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [servings, setServings] = useState(10);
  const [servingOz, setServingOz] = useState(4);
  const [count, setCount] = useState(1);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return catalog.recipes
      .filter(r => r.lines.length && (!q || r.name.toLowerCase().includes(q)))
      .sort((a, b) => STATION_ORDER.indexOf(a.method) - STATION_ORDER.indexOf(b.method) || a.name.localeCompare(b.name));
  }, [catalog, query]);

  const open = (id: string) => {
    if (openId === id) return setOpenId(null);
    setOpenId(id);
    setServingOz(defaultServingOz(catalog, id));
    setCount(catalog.recipes.find(r => r.id === id)?.yieldCount ?? 1);
  };

  // By count: batches = how many ÷ how many one batch makes.
  // By servings: batches = servings × serving oz ÷ cooked oz per batch. All in code.
  const openRecipe = openId ? catalog.recipes.find(r => r.id === openId) : undefined;
  const byCount = openRecipe?.yieldCount;
  const perBatch = openId ? batchOz(catalog, openId) : 0;
  const batches = byCount ? count / byCount : perBatch > 0 ? (servings * servingOz) / perBatch : 0;
  const card = openId && batches > 0 ? recipeCard(catalog, openId, batches) : undefined;
  const servingsPerBatch = perBatch > 0 && servingOz > 0 ? perBatch / servingOz : 0;

  return (
    <main>
      <input className="search" type="search" placeholder="Search recipes" value={query} onChange={e => setQuery(e.target.value)} />
      <section className="card">
        {list.length === 0 && <p className="muted">No recipes match.</p>}
        {list.map((r, i) => (
          <div key={r.id}>
            {(i === 0 || list[i - 1]!.method !== r.method) && <h4>{STATION[r.method] ?? r.method}</h4>}
            <button className={`recipe-row${openId === r.id ? ' open' : ''}`} onClick={() => open(r.id)}>{r.name}</button>
            {openId === r.id && (
              <div className="recipe-open">
                {r.yieldCount ? (
                  <>
                    <div className="scale">
                      <label>Make <input type="number" min="1" step="1" inputMode="numeric" value={count}
                        onChange={e => setCount(Math.max(0, Number(e.target.value)))} /> {r.yieldUnit}</label>
                    </div>
                    <p className="muted">One batch makes {r.yieldCount} {r.yieldUnit}.</p>
                  </>
                ) : (<>
                <div className="scale">
                  <label>Servings <input type="number" min="1" step="1" inputMode="numeric" value={servings}
                    onChange={e => setServings(Math.max(0, Number(e.target.value)))} /></label>
                  <label>× <input type="number" min="0.1" step="0.5" inputMode="decimal" value={servingOz}
                    onChange={e => setServingOz(Math.max(0, Number(e.target.value)))} /> oz each</label>
                </div>
                {perBatch > 0
                  ? <p className="muted">
                      One batch makes about {servingsPerBatch.toFixed(1)} servings of {servingOz} oz.
                      {batchIsEstimate(catalog, r.id) && <span className="estimate"> Estimate — add padding until a batch is weighed.</span>}
                    </p>
                  : <p className="error">This recipe's cooked batch weight isn't known yet, so it can't be scaled by servings.</p>}
                </>)}
                {card && <Card card={card} />}
                {card?.notes && <p className="raw">{card.notes}</p>}
                {card?.steps && <div className="steps">{card.steps}</div>}
              </div>
            )}
          </div>
        ))}
      </section>
    </main>
  );
}
