// Saving nutrition data and the kitchen's label padding.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Nutrition, Padding } from '../core/nutrition';

export async function saveNutrition(db: SupabaseClient, ingredientId: string, n: Nutrition & { source: string }): Promise<void> {
  const { error } = await db.from('ingredients').update({ nutrition: n }).eq('id', ingredientId);
  if (error) throw new Error(error.message);
}

export async function savePadding(db: SupabaseClient, kitchenId: string, p: Padding): Promise<void> {
  const { error } = await db.from('kitchens').update({ macro_padding: p }).eq('id', kitchenId);
  if (error) throw new Error(error.message);
}

export async function saveOwnLabel(db: SupabaseClient, menuItemId: string, ownLabel: boolean): Promise<void> {
  const { error } = await db.from('menu_items').update({ own_label: ownLabel }).eq('id', menuItemId);
  if (error) throw new Error(error.message);
}
