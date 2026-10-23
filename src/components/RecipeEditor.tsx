import { useMemo, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { draftLineOz, resolveItem } from '../core/editLines';
import { missingWeight, ozToGrams } from '../core/measure';
import { STATION_ORDER, STORE_ORDER, type Catalog, type Recipe } from '../core/planner';
import { formatOz } from '../core/units';
import { addIngredient, draftFrom, saveRecipe, setIngredientWeight, type DraftLine, type RecipeDraft } from '../lib/recipes';

const STATION: Record<string, string> = {
  smoke: 'Smoke', bake: 'Bake', roast: 'Roast', braise: 'Braise', boil: 'Boil', simmer: 'Simmer',
  saute: 'Sauté', grill: 'Grill', 'no-cook': 'No-cook',
};
const UNITS = ['lb', 'oz', 'cup', 'tbsp', 'tsp', 'each', 'can', 'clove', 'pinch', 'batch'];
const num = (s: string) => (s.trim() === '' ? null : Number(s));

type Props = {
  db: SupabaseClient;
  catalog: Catalog;
  recipe?: Recipe;
  by?: string;
  onSaved: (id: string) => void;
  onCancel: () => void;
};

/** Edit a recipe (or start a new one). Saving keeps the old version in the history. */
export function RecipeEditor({ db, catalog, recipe, by, onSaved, onCancel }: Props) {
  const original = useMemo(() => draftFrom(recipe), [recipe]);
  const [d, setD] = useState<RecipeDraft>(original);
  const [batchUnit, setBatchUnit] = useState<'oz' | 'lb'>('lb');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Weights entered while editing (1 cup / 1 each), applied to this draft before the catalog reloads.
  const [weights, setWeights] = useState<Record<string, { gramsPerCup?: number; gramsPerEach?: number }>>({});
  const [added, setAdded] = useState<{ id: string; name: string }[]>([]);

  const cat: Catalog = useMemo(() => ({
    ...catalog,
    ingredients: [...catalog.ingredients, ...added.map(a => ({ id: a.id, name: a.name, yield: 1, yieldSource: 'estimate' as const }))]
      .map(i => ({ ...i, ...weights[i.id] })),
  }), [catalog, added, weights]);
  const groups = useMemo(() => [...new Set(catalog.recipes.map(r => r.prepGroup).filter(Boolean))] as string[], [catalog]);
  const ingName = (id: string | null) => cat.ingredients.find(i => i.id === id)?.name;
  const recName = (id: string | null) => cat.recipes.find(r => r.id === id)?.name;

  const set = (patch: Partial<RecipeDraft>) => setD(cur => ({ ...cur, ...patch }));
  const setLine = (i: number, patch: Partial<DraftLine>) =>
    setD(cur => ({ ...cur, lines: cur.lines.map((l, n) => (n === i ? { ...l, ...patch } : l)) }));
  const move = (i: number, by: -1 | 1) => setD(cur => {
    const lines = [...cur.lines];
    const j = i + by;
    if (j < 0 || j >= lines.length) return cur;
    [lines[i], lines[j]] = [lines[j]!, lines[i]!];
    return { ...cur, lines };
  });
  // A line's original is the one with the same text and link (survives moving and removing other lines).
  const originalOf = (l: DraftLine) => original.lines.find(o => o.ingredientId === l.ingredientId && o.recipeId === l.recipeId && o.name === l.name);
  const withOz = (l: DraftLine): DraftLine => ({ ...l, oz: draftLineOz(l, originalOf(l), cat) });

  async function newIngredient(i: number, name: string, category: string, staple: boolean) {
    try {
      const id = await addIngredient(db, { name, category, staple });
      setAdded(a => [...a, { id, name: name.trim() }]);
      setLine(i, { ingredientId: id, recipeId: null });
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }
  async function saveWeight(ingredientId: string, per: 'cup' | 'each', oz: number) {
    try {
      const grams = ozToGrams(oz);
      await setIngredientWeight(db, ingredientId, per, grams);
      setWeights(w => ({ ...w, [ingredientId]: { ...w[ingredientId], ...(per === 'cup' ? { gramsPerCup: grams } : { gramsPerEach: grams }) } }));
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }

  async function save() {
    setError(null);
    if (!d.name.trim()) return setError('Give the recipe a name.');
    if (!d.method) return setError('Pick a station, so it lands on a station\'s prep list.');
    setSaving(true);
    try {
      const id = await saveRecipe(db, { ...d, lines: d.lines.filter(l => l.name.trim() || l.ingredientId || l.recipeId).map(withOz) }, by);
      onSaved(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  }

  return (
    <div className="editor">
      <label className="field">Name <input value={d.name} onChange={e => set({ name: e.target.value })} /></label>
      <div className="field-row">
        <label className="field">Station
          <select value={d.method} onChange={e => set({ method: e.target.value })}>
            <option value="">— choose —</option>
            {STATION_ORDER.filter(m => m !== 'unassigned').map(m => <option key={m} value={m}>{STATION[m] ?? m}</option>)}
          </select>
        </label>
        <label className="field">Shared pot (optional)
          <input list="pots" value={d.prepGroup} placeholder="e.g. Salted water" onChange={e => set({ prepGroup: e.target.value })} />
          <datalist id="pots">{groups.map(g => <option key={g} value={g} />)}</datalist>
        </label>
      </div>
      <label className="toggle">
        <input type="checkbox" checked={!d.onPrepSheet} onChange={e => set({ onPrepSheet: !e.target.checked })} />
        <span>Mixed into another dish on the spot (like broth from base): no prep line of its own</span>
      </label>

      <h4>Ingredients <span className="muted">(for one batch)</span></h4>
      <table className="lines">
        <thead><tr><th>Amount</th><th>Unit</th><th>Item</th><th /></tr></thead>
        <tbody>
          {d.lines.flatMap((l, i) => {
            const linked = l.ingredientId ? ingName(l.ingredientId) : l.recipeId ? recName(l.recipeId) : undefined;
            const oz = draftLineOz(l, originalOf(l), cat);
            const per = l.ingredientId && oz === null && l.amount !== null ? missingWeight(l.unit) : null;
            return [
              <tr key={i}>
                <td><input className="amt" type="number" inputMode="decimal" step="any" value={l.amount ?? ''} onChange={e => setLine(i, { amount: num(e.target.value) })} /></td>
                <td><input className="unit" list="units" value={l.unit} onChange={e => setLine(i, { unit: e.target.value })} /></td>
                <td>
                  <input list="items" value={l.name} placeholder="ingredient or recipe"
                    onChange={e => setLine(i, { name: e.target.value, ...resolveItem(e.target.value, cat) })} />
                  <input className="note" value={l.note} placeholder="note (diced, optional…)" onChange={e => setLine(i, { note: e.target.value })} />
                  <div className="raw">
                    {linked ? <>{l.recipeId ? 'recipe' : 'ingredient'}: {linked}{oz !== null && <> · {formatOz(oz)}</>}</> : l.name.trim() && 'not linked'}
                  </div>
                </td>
                <td className="row-btns">
                  <button className="btn link small" title="Move up" onClick={() => move(i, -1)}>↑</button>
                  <button className="btn link small" title="Move down" onClick={() => move(i, 1)}>↓</button>
                  <button className="btn link small" title="Remove" onClick={() => setD(cur => ({ ...cur, lines: cur.lines.filter((_, n) => n !== i) }))}>✕</button>
                </td>
              </tr>,
              ...(!linked && l.name.trim() ? [<tr key={`${i}:new`}><td colSpan={4}><NewIngredient name={l.name} onAdd={(c, s) => void newIngredient(i, l.name, c, s)} /></td></tr>] : []),
              ...(per && l.ingredientId ? [<tr key={`${i}:w`}><td colSpan={4}><AskWeight per={per} unit={l.unit} name={linked ?? l.name} onSave={oz => void saveWeight(l.ingredientId!, per, oz)} /></td></tr>] : []),
            ];
          })}
        </tbody>
      </table>
      <datalist id="units">{UNITS.map(u => <option key={u} value={u} />)}</datalist>
      <datalist id="items">
        {cat.ingredients.map(i => <option key={i.id} value={i.name} />)}
        {cat.recipes.filter(r => r.id !== d.id).map(r => <option key={r.id} value={r.name}>recipe</option>)}
      </datalist>
      <button className="btn link" onClick={() => set({ lines: [...d.lines, { amount: null, unit: '', name: '', note: '', ingredientId: null, recipeId: null, oz: null }] })}>+ Add ingredient</button>

      <h4>Batch</h4>
      <div className="field-row">
        <label className="field">Weighed batch (cooked)
          <span className="inline">
            <input type="number" inputMode="decimal" step="any"
              value={d.finishedOz === null ? '' : batchUnit === 'lb' ? +(d.finishedOz / 16).toFixed(3) : +d.finishedOz.toFixed(2)}
              onChange={e => { const v = num(e.target.value); set({ finishedOz: v === null ? null : batchUnit === 'lb' ? v * 16 : v, finishedOzMeasured: v !== null }); }} />
            <select value={batchUnit} onChange={e => setBatchUnit(e.target.value as 'oz' | 'lb')}><option>lb</option><option>oz</option></select>
          </span>
          <span className="raw">{d.finishedOz === null ? 'Blank = estimated from the ingredients.' : d.finishedOzMeasured ? 'Weighed in this kitchen.' : 'Estimate.'}</span>
        </label>
        <label className="field">Made by count (optional)
          <span className="inline">
            <input type="number" inputMode="numeric" placeholder="12" value={d.yieldCount ?? ''} onChange={e => set({ yieldCount: num(e.target.value) })} />
            <input placeholder="treats, loaves…" value={d.yieldUnit} onChange={e => set({ yieldUnit: e.target.value })} />
          </span>
        </label>
      </div>

      <label className="field">Steps <textarea rows={6} value={d.steps} onChange={e => set({ steps: e.target.value })} /></label>
      <label className="field">Notes <textarea rows={3} value={d.notes} onChange={e => set({ notes: e.target.value })} /></label>

      {error && <p className="error">{error}</p>}
      <div className="field-row">
        <button className="btn" disabled={saving} onClick={() => void save()}>{saving ? 'Saving…' : 'Save'}</button>
        <button className="btn link" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function NewIngredient({ name, onAdd }: { name: string; onAdd: (category: string, staple: boolean) => void }) {
  const [category, setCategory] = useState('');
  const [staple, setStaple] = useState(false);
  return (
    <div className="ask">
      “{name.trim()}” isn't in the ingredient list.{' '}
      <select value={category} onChange={e => setCategory(e.target.value)}>
        <option value="">aisle…</option>
        {STORE_ORDER.map(c => <option key={c}>{c}</option>)}
      </select>{' '}
      <label><input type="checkbox" checked={staple} onChange={e => setStaple(e.target.checked)} /> staple</label>{' '}
      <button className="btn small" disabled={!category} title={category ? '' : 'Pick its aisle first'} onClick={() => onAdd(category, staple)}>Add ingredient</button>
    </div>
  );
}

function AskWeight({ per, unit, name, onSave }: { per: 'cup' | 'each'; unit: string; name: string; onSave: (oz: number) => void }) {
  const [oz, setOz] = useState('');
  const one = unit.trim().replace(/(?<=[a-z])(es|s)$/i, m => (/(ch|sh|ss|x)$/i.test(unit.trim().slice(0, -2)) ? '' : m === 'es' ? 'e' : ''));
  const what = per === 'cup' ? `1 cup of ${name}` : `1 ${one || 'each'} of ${name}`;
  return (
    <div className="ask">
      Needs a weight: <strong>{what}</strong> weighs{' '}
      <input className="amt" type="number" inputMode="decimal" step="any" value={oz} onChange={e => setOz(e.target.value)} /> oz{' '}
      <button className="btn small" disabled={!(Number(oz) > 0)} onClick={() => onSave(Number(oz))}>Save weight</button>
      <span className="raw"> Saved to the ingredient, so you only enter it once.</span>
    </div>
  );
}

