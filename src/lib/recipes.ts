// Saving recipes from the app: one call saves the recipe and its lines and keeps the version it replaces.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Recipe } from '../core/planner';

export type DraftLine = {
  amount: number | null;
  unit: string;
  /** What the recipe says, e.g. "yellow onion, diced". */
  name: string;
  note: string;
  ingredientId: string | null;
  recipeId: string | null;
  /** As-purchased oz for one batch (sub-recipe lines: that recipe's finished oz). Null = no weight yet. */
  oz: number | null;
};

export type RecipeDraft = {
  id?: string;
  name: string;
  method: string;
  prepGroup: string;
  onPrepSheet: boolean;
  notes: string;
  steps: string;
  finishedOz: number | null;
  finishedOzMeasured: boolean;
  yieldCount: number | null;
  yieldUnit: string;
  ozPerPiece: number | null;
  lines: DraftLine[];
};

export function draftFrom(r: Recipe | undefined): RecipeDraft {
  return {
    ...(r ? { id: r.id } : {}),
    name: r?.name ?? '',
    method: r && r.method !== 'unassigned' ? r.method : '',
    prepGroup: r?.prepGroup ?? '',
    onPrepSheet: r?.onPrepSheet !== false,
    notes: r?.notes ?? '',
    steps: r?.steps ?? '',
    finishedOz: r?.finishedOz ?? null,
    finishedOzMeasured: r?.finishedOzMeasured ?? false,
    yieldCount: r?.yieldCount ?? null,
    yieldUnit: r?.yieldUnit ?? '',
    ozPerPiece: r?.ozPerPiece ?? null,
    lines: (r?.lines ?? []).map(l => ({
      amount: l.amount ?? null,
      unit: l.unit ?? '',
      name: l.name ?? '',
      note: l.note ?? '',
      ingredientId: l.ingredientId,
      recipeId: l.recipeId ?? null,
      oz: l.oz,
    })),
  };
}

const recipeJson = (d: RecipeDraft) => ({
  ...(d.id ? { id: d.id } : {}),
  name: d.name.trim(),
  method: d.method,
  prep_group: d.prepGroup.trim(),
  on_prep_sheet: d.onPrepSheet,
  notes: d.notes,
  steps: d.steps,
  finished_oz: d.finishedOz,
  finished_oz_measured: d.finishedOz !== null && d.finishedOzMeasured,
  yield_count: d.yieldCount,
  yield_unit: d.yieldUnit.trim(),
  oz_per_piece: d.ozPerPiece,
});

const linesJson = (d: RecipeDraft) => d.lines.map(l => ({
  amount: l.amount,
  unit: l.unit.trim(),
  raw_name: l.name.trim(),
  note: l.note.trim(),
  ingredient_id: l.recipeId ? null : l.ingredientId,
  sub_recipe_id: l.recipeId,
  oz: l.oz,
}));

export async function saveRecipe(db: SupabaseClient, d: RecipeDraft, by?: string): Promise<string> {
  const { data, error } = await db.rpc('save_recipe', { p_recipe: recipeJson(d), p_lines: linesJson(d), p_by: by ?? null });
  if (error) throw new Error(error.message);
  return data as string;
}

export type RecipeVersion = { id: string; savedAt: string; savedBy: string | null; draft: RecipeDraft };

/** Earlier versions of a recipe, newest first, ready to put back with saveRecipe. */
export async function recipeVersions(db: SupabaseClient, recipeId: string): Promise<RecipeVersion[]> {
  const { data, error } = await db.from('recipe_versions')
    .select('id, saved_at, saved_by_email, recipe, lines').eq('recipe_id', recipeId).order('saved_at', { ascending: false }).limit(20);
  if (error) throw new Error(error.message);
  type Row = { id: string; saved_at: string; saved_by_email: string | null; recipe: Record<string, unknown>; lines: Record<string, unknown>[] };
  const num = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number(v));
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  return ((data ?? []) as Row[]).map(v => ({
    id: v.id,
    savedAt: v.saved_at,
    savedBy: v.saved_by_email,
    draft: {
      id: recipeId,
      name: str(v.recipe.name),
      method: str(v.recipe.method),
      prepGroup: str(v.recipe.prep_group),
      onPrepSheet: v.recipe.on_prep_sheet !== false,
      notes: str(v.recipe.notes),
      steps: str(v.recipe.steps),
      finishedOz: num(v.recipe.finished_oz),
      finishedOzMeasured: v.recipe.finished_oz_measured === true,
      yieldCount: num(v.recipe.yield_count),
      yieldUnit: str(v.recipe.yield_unit),
      ozPerPiece: num(v.recipe.oz_per_piece),
      lines: v.lines.map(l => ({
        amount: num(l.amount), unit: str(l.unit), name: str(l.raw_name), note: str(l.note),
        ingredientId: (l.ingredient_id as string | null) ?? null, recipeId: (l.sub_recipe_id as string | null) ?? null, oz: num(l.oz),
      })),
    },
  }));
}

export async function addIngredient(db: SupabaseClient, i: { name: string; category: string; staple: boolean }): Promise<string> {
  const { data, error } = await db.from('ingredients')
    .insert({ name: i.name.trim(), category: i.category || null, staple: i.staple, yield: 1, yield_source: 'estimate' })
    .select('id').single();
  if (error) throw new Error(error.message.includes('duplicate') ? `“${i.name}” is already an ingredient.` : error.message);
  return (data as { id: string }).id;
}

/** Save what 1 cup or 1 each of an ingredient weighs (entered in oz, stored in grams). */
export async function setIngredientWeight(db: SupabaseClient, id: string, per: 'cup' | 'each', grams: number): Promise<void> {
  const { error } = await db.from('ingredients').update(per === 'cup' ? { grams_per_cup: grams } : { grams_per_each: grams }).eq('id', id);
  if (error) throw new Error(error.message);
}
