import { useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { recipeVersions, saveRecipe, type RecipeVersion } from '../lib/recipes';

/** Earlier versions of a recipe; putting one back is itself saved as a new version. */
export function RecipeHistory({ db, recipeId, by, onRestored }: { db: SupabaseClient; recipeId: string; by?: string; onRestored: () => void }) {
  const [versions, setVersions] = useState<RecipeVersion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = () => { recipeVersions(db, recipeId).then(setVersions, e => setError(e instanceof Error ? e.message : String(e))); };
  async function restore(v: RecipeVersion) {
    if (!window.confirm(`Put back the version saved ${new Date(v.savedAt).toLocaleString()}? The current one is kept in the history.`)) return;
    try { await saveRecipe(db, v.draft, by); onRestored(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }
  return (
    <details className="history no-print" onToggle={e => { if ((e.target as HTMLDetailsElement).open && !versions) load(); }}>
      <summary>Change history</summary>
      {error && <p className="error">{error}</p>}
      {versions === null ? <p className="muted">Loading…</p> : versions.length === 0 ? <p className="muted">No earlier versions yet.</p> : (
        <table><tbody>
          {versions.map(v => (
            <tr key={v.id}>
              <td>Before the save of {new Date(v.savedAt).toLocaleString()}{v.savedBy && <div className="raw">saved by {v.savedBy}</div>}</td>
              <td className="num"><button className="btn link small" onClick={() => void restore(v)}>Put back</button></td>
            </tr>
          ))}
        </tbody></table>
      )}
    </details>
  );
}
