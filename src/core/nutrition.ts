// Nutrition panel per meal (kitchen 2026-10-23): one panel per menu item, for its regular plate (the
// standard 4/4/4 oz serving), padded by the kitchen's percentages, rounded the way US labels round.
// Pure. Every number comes from ingredient data × recipe weights; an ingredient with no data stops the
// panel (listed as missing) instead of being guessed.

import { finishedBatchOz, type Catalog } from './planner';

export type Macros = { kcal: number; protein: number; carbs: number; fat: number };
/** Per 100 g. basis 'raw' = as bought (USDA raw entries); 'cooked' = per 100 g of the finished ingredient. */
export type Nutrition = Macros & { basis: 'raw' | 'cooked' };
/** Extra added to each macro before rounding: 0.1 = +10%. */
export type Padding = Macros;


const GRAMS_PER_OZ = 28.3495;
const ZERO: Macros = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
const add = (a: Macros, b: Macros, k = 1): Macros =>
  ({ kcal: a.kcal + b.kcal * k, protein: a.protein + b.protein * k, carbs: a.carbs + b.carbs * k, fat: a.fat + b.fat * k });


/** Macros in one finished oz of a recipe, or the ingredients still missing nutrition data. */
export function recipeMacrosPerOz(catalog: Catalog, recipeId: string, seen: string[] = []): { perOz: Macros } | { missing: string[] } {
  const recipes = new Map(catalog.recipes.map(r => [r.id, r]));
  const ingredients = new Map(catalog.ingredients.map(i => [i.id, i]));
  const recipe = recipes.get(recipeId);
  if (!recipe) return { missing: [`recipe ${recipeId}`] };
  if (seen.includes(recipeId)) return { missing: [`${recipe.name} (used inside itself)`] };
  const batch = finishedBatchOz(recipe, ingredients);
  if (batch <= 0) return { missing: [`${recipe.name}: batch weight`] };

  let total = ZERO;
  const missing: string[] = [];
  for (const l of recipe.lines) {
    if (l.oz === null) { missing.push(`${recipe.name}: ${l.name ?? 'a line'} has no weight`); continue; }
    if (l.recipeId) {
      const sub = recipeMacrosPerOz(catalog, l.recipeId, [...seen, recipeId]);
      if ('missing' in sub) missing.push(...sub.missing);
      else total = add(total, sub.perOz, l.oz);
      continue;
    }
    const ing = l.ingredientId ? ingredients.get(l.ingredientId) : undefined;
    if (!ing?.nutrition) { missing.push(ing?.name ?? l.name ?? 'unlinked ingredient'); continue; }
    // grams of the ingredient in the batch, as bought or as cooked, × per-100 g values
    const grams = l.oz * GRAMS_PER_OZ * (ing.nutrition.basis === 'cooked' ? ing.yield : 1);
    total = add(total, ing.nutrition, grams / 100);
  }
  if (missing.length) return { missing: [...new Set(missing)] };
  return { perOz: add(ZERO, total, 1 / batch) };
}

export type MealPanel =
  | { title: string; servingOz: number; macros: Macros; parts: { name: string; oz: number }[] }
  | { title: string; missing: string[] };

/** One panel per meal: its regular plate. Side plates and bakery items vary by pick, so they're left out. */
export function mealPanels(catalog: Catalog): MealPanel[] {
  const recipes = new Map(catalog.recipes.map(r => [r.id, r]));
  const panels: MealPanel[] = [];
  for (const m of catalog.menu) {
    if (m.kind !== 'meal' || !m.sizes.regular) continue;
    const title = m.titles[0] ?? m.id;
    let macros = ZERO;
    let servingOz = 0;
    const missing: string[] = [];
    const parts: { name: string; oz: number }[] = [];
    for (const p of m.sizes.regular.portions) {
      const recipe = recipes.get(p.recipeId);
      const oz = p.oz ?? (p.pieces && recipe?.ozPerPiece ? p.pieces * recipe.ozPerPiece : undefined);
      if (oz === undefined) { missing.push(`${recipe?.name ?? p.recipeId}: weight per piece`); continue; }
      const per = recipeMacrosPerOz(catalog, p.recipeId);
      if ('missing' in per) { missing.push(...per.missing); continue; }
      macros = add(macros, per.perOz, oz);
      servingOz += oz;
      parts.push({ name: recipe?.name ?? p.recipeId, oz });
    }
    panels.push(missing.length ? { title, missing: [...new Set(missing)] } : { title, servingOz, macros, parts });
  }
  return panels.sort((a, b) => a.title.localeCompare(b.title));
}

export const pad = (m: Macros, p: Padding): Macros =>
  ({ kcal: m.kcal * (1 + p.kcal), protein: m.protein * (1 + p.protein), carbs: m.carbs * (1 + p.carbs), fat: m.fat * (1 + p.fat) });

/** US label rounding (21 CFR 101.9): calories to 5/10, fat to 0.5/1 g, carbs and protein to 1 g. */
export function labelRound(m: Macros): { kcal: string; protein: string; carbs: string; fat: string } {
  const kcal = m.kcal < 5 ? 0 : m.kcal <= 50 ? Math.round(m.kcal / 5) * 5 : Math.round(m.kcal / 10) * 10;
  const fat = m.fat < 0.5 ? 0 : m.fat < 5 ? Math.round(m.fat * 2) / 2 : Math.round(m.fat);
  const grams = (g: number) => (g < 0.5 ? '0 g' : g < 1 ? '<1 g' : `${Math.round(g)} g`);
  return { kcal: String(kcal), protein: grams(m.protein), carbs: grams(m.carbs), fat: `${fat} g` };
}
