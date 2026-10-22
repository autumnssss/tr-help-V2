// Recipe editor rules for lines. Pure.

import { lineOz, unitKind } from './measure';
import { batchOz, type Catalog } from './planner';
import type { DraftLine } from '../lib/recipes';

const norm = (s: string) => s.trim().toLowerCase();

/** What a typed item name links to: a library ingredient, or another recipe ("Chicken Broth"). */
export function resolveItem(name: string, catalog: Catalog): { ingredientId: string | null; recipeId: string | null } {
  const n = norm(name);
  if (!n) return { ingredientId: null, recipeId: null };
  const ing = catalog.ingredients.find(i => norm(i.name) === n);
  if (ing) return { ingredientId: ing.id, recipeId: null };
  const rec = catalog.recipes.find(r => norm(r.name) === n);
  return { ingredientId: null, recipeId: rec?.id ?? null };
}

/**
 * The weight to save for a line. A line nobody changed keeps the weight it has (so opening and saving a
 * recipe never moves its numbers); a changed line is worked out again. Sub-recipe lines: weight units
 * convert, "batch" or no unit = that many of the other recipe's batches; anything else needs a weight.
 */
export function draftLineOz(line: DraftLine, original: DraftLine | undefined, catalog: Catalog): number | null {
  const unchanged = original && original.oz !== null && original.amount === line.amount && original.unit === line.unit
    && original.ingredientId === line.ingredientId && original.recipeId === line.recipeId;
  if (unchanged) return original.oz;
  if (line.recipeId) {
    if (line.amount === null) return null;
    if (unitKind(line.unit) === 'weight') return lineOz(line.amount, line.unit, undefined);
    if (['', 'batch', 'batches', 'recipe', 'recipes'].includes(norm(line.unit))) {
      const oz = batchOz(catalog, line.recipeId);
      return oz > 0 ? line.amount * oz : null;
    }
    return null;
  }
  if (!line.ingredientId) return null;
  return lineOz(line.amount, line.unit, catalog.ingredients.find(i => i.id === line.ingredientId));
}
