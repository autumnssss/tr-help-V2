import { useMemo, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { labelRound, mealPanels, pad, type Padding } from '../core/nutrition';
import type { Catalog, Ingredient } from '../core/planner';
import { saveNutrition, saveOwnLabel, savePadding } from '../lib/nutrition';

const ZERO: Padding = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
const KEYS = [['kcal', 'Calories'], ['protein', 'Protein'], ['carbs', 'Carbs'], ['fat', 'Fat']] as const;
const line = (r: ReturnType<typeof labelRound>) => `Calories ${r.kcal} · Protein ${r.protein} · Carbs ${r.carbs} · Fat ${r.fat}`;

/** One nutrition panel per meal (its regular 4/4/4 plate), padded and rounded for the label. */
export function Nutrition({ catalog, db, kitchenId, padding, onChanged }: {
  catalog: Catalog; db?: SupabaseClient; kitchenId?: string; padding?: Padding; onChanged?: () => void;
}) {
  const panels = useMemo(() => mealPanels(catalog), [catalog]);
  const ownLabel = catalog.menu.filter(m => m.kind === 'meal' && m.ownLabel);
  const p = padding ?? ZERO;
  const [adding, setAdding] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const byName = new Map(catalog.ingredients.map(i => [i.name, i]));
  const ready = panels.filter(x => 'macros' in x).length;

  async function setOwnLabel(id: string, value: boolean) {
    if (!db) return;
    try { await saveOwnLabel(db, id, value); setError(null); onChanged?.(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }

  return (
    <main>
      <section className="card">
        <h3>Nutrition labels</h3>
        <p className="muted">
          One panel per meal, for the regular plate. Padded by the percentages below, then rounded the way US labels round.
          These are estimates from ingredient data and recipe weights, not lab tests. {ready} of {panels.length} meals ready.
        </p>
        {db && kitchenId && <PaddingForm db={db} kitchenId={kitchenId} padding={p} onSaved={() => onChanged?.()} />}
        {error && <p className="error">{error}</p>}
      </section>

      {panels.map(panel => (
        <section key={panel.id} className="card">
          <h3>{panel.title}</h3>
          {'macros' in panel ? (
            <>
              <p className="label-line"><strong>{line(labelRound(pad(panel.macros, p)))}</strong></p>
              <p className="raw">
                Per plate: {panel.parts.map(x => `${x.name} ${x.oz} oz`).join(' + ')}. Before padding: {line(labelRound(panel.macros))}
              </p>
            </>
          ) : (
            <>
              <p className="error">Needs nutrition data before it has a panel:</p>
              <ul>
                {panel.missing.map(m => {
                  const ing = byName.get(m);
                  return (
                    <li key={m}>
                      {m}{' '}
                      {ing && db && adding !== `${panel.title}|${m}` && <button className="btn link small" onClick={() => setAdding(`${panel.title}|${m}`)}>Add</button>}
                      {ing && db && adding === `${panel.title}|${m}` && (
                        <NutritionForm db={db} ingredient={ing} onSaved={() => { setAdding(null); onChanged?.(); }} onCancel={() => setAdding(null)} />
                      )}
                    </li>
                  );
                })}
              </ul>
              {db && <button className="btn link small" onClick={() => void setOwnLabel(panel.id, true)}>Already has its own label (hide)</button>}
            </>
          )}
        </section>
      ))}

      {ownLabel.length > 0 && (
        <section className="card">
          <h3>Using their own labels</h3>
          <ul>
            {ownLabel.map(m => (
              <li key={m.id}>
                {m.titles[0] ?? m.id}{' '}
                {db && <button className="btn link small" onClick={() => void setOwnLabel(m.id, false)}>Build a panel instead</button>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {db && <IngredientNutrition db={db} ingredients={catalog.ingredients} onSaved={() => onChanged?.()} />}
    </main>
  );
}

/** Look up any ingredient's numbers and correct them (e.g. a package label instead of the USDA stand-in). */
function IngredientNutrition({ db, ingredients, onSaved }: { db: SupabaseClient; ingredients: Ingredient[]; onSaved: () => void }) {
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const found = q.trim().length < 2 ? [] : ingredients
    .filter(i => i.name.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, 20);
  return (
    <section className="card">
      <h3>Ingredient nutrition</h3>
      <p className="muted">Find an ingredient to see where its numbers came from, or correct them from a package label.</p>
      <div className="editor">
        <label className="field">Ingredient
          <input type="search" value={q} placeholder="Type 2+ letters" onChange={e => { setQ(e.target.value); setEditing(null); }} />
        </label>
      </div>
      <ul>
        {found.map(i => (
          <li key={i.id}>
            <strong>{i.name}</strong>{' '}
            {i.nutrition
              ? <span className="raw">per 100 g: {i.nutrition.kcal} cal · P {i.nutrition.protein} g · C {i.nutrition.carbs} g · F {i.nutrition.fat} g ({i.nutrition.basis}){i.nutrition.source ? ` — ${i.nutrition.source}` : ''}</span>
              : <span className="error">no data</span>}{' '}
            {editing !== i.id && <button className="btn link small" onClick={() => setEditing(i.id)}>Edit</button>}
            {editing === i.id && <NutritionForm db={db} ingredient={i} onSaved={() => { setEditing(null); onSaved(); }} onCancel={() => setEditing(null)} />}
          </li>
        ))}
      </ul>
    </section>
  );
}

function PaddingForm({ db, kitchenId, padding, onSaved }: { db: SupabaseClient; kitchenId: string; padding: Padding; onSaved: () => void }) {
  const [v, setV] = useState<Record<string, string>>(Object.fromEntries(KEYS.map(([k]) => [k, String(Math.round(padding[k] * 100))])));
  const [msg, setMsg] = useState<string | null>(null);
  async function save() {
    const next = Object.fromEntries(KEYS.map(([k]) => [k, (Number(v[k]) || 0) / 100])) as Padding;
    try { await savePadding(db, kitchenId, next); setMsg('Saved.'); onSaved(); } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
  }
  return (
    <div className="editor">
      <div className="field-row">
        {KEYS.map(([k, label]) => (
          <label key={k} className="field">{label} +%
            <input type="number" inputMode="decimal" step="any" value={v[k]} onChange={e => setV({ ...v, [k]: e.target.value })} />
          </label>
        ))}
      </div>
      <div className="field-row"><button className="btn small" onClick={() => void save()}>Save padding</button>{msg && <span className="muted">{msg}</span>}</div>
    </div>
  );
}

/** From a package label (per serving) or USDA (serving = 100 g). Converted to per 100 g in code.
 *  Editing starts from the saved numbers (per 100 g). */
function NutritionForm({ db, ingredient, onSaved, onCancel }: { db: SupabaseClient; ingredient: Ingredient; onSaved: () => void; onCancel: () => void }) {
  const had = ingredient.nutrition;
  const [serving, setServing] = useState('100');
  const [v, setV] = useState<Record<string, string>>(Object.fromEntries(KEYS.map(([k]) => [k, had ? String(had[k]) : ''])));
  const [basis, setBasis] = useState<'raw' | 'cooked'>(had?.basis ?? 'raw');
  const [error, setError] = useState<string | null>(null);
  async function save() {
    const g = Number(serving);
    if (!(g > 0) || KEYS.some(([k]) => v[k]!.trim() === '' || !(Number(v[k]) >= 0))) return setError('Fill in the serving size and all four numbers.');
    const per100 = Object.fromEntries(KEYS.map(([k]) => [k, (Number(v[k]) * 100) / g])) as Padding;
    try {
      const unchanged = had && g === 100 && basis === had.basis && KEYS.every(([k]) => Number(v[k]) === had[k]);
      if (unchanged) return onCancel();
      await saveNutrition(db, ingredient.id, { ...per100, basis, source: g === 100 ? 'entered per 100 g' : `package label, ${g} g serving` });
      onSaved();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }
  return (
    <div className="editor ask">
      {had && <p className="raw">Shown per 100 g. For a package label, change the serving size to the label's grams and type the label's numbers.</p>}
      <div className="field-row">
        <label className="field">Serving size (g)
          <input type="number" inputMode="decimal" step="any" value={serving} onChange={e => setServing(e.target.value)} />
        </label>
        {KEYS.map(([k, label]) => (
          <label key={k} className="field">{label}{k === 'kcal' ? '' : ' (g)'}
            <input type="number" inputMode="decimal" step="any" value={v[k]} onChange={e => setV({ ...v, [k]: e.target.value })} />
          </label>
        ))}
      </div>
      <label className="toggle">
        <input type="checkbox" checked={basis === 'cooked'} onChange={e => setBasis(e.target.checked ? 'cooked' : 'raw')} />
        <span>These numbers are for the cooked food (leave off for package labels and raw ingredients)</span>
      </label>
      {error && <p className="error">{error}</p>}
      <div className="field-row"><button className="btn small" onClick={() => void save()}>Save</button><button className="btn link small" onClick={onCancel}>Cancel</button></div>
    </div>
  );
}
