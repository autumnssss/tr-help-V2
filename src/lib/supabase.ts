import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const configError = !url || !key
  ? 'Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Copy .env.example to .env (or set them in Netlify).'
  : null;

export const db = createClient(url ?? 'http://localhost', key ?? 'missing');

/** The signed-in user's kitchen. Single-kitchen for now: the first membership. */
export async function myKitchen(): Promise<{ id: string; name: string } | null> {
  const { data, error } = await db.from('kitchens').select('id, name').order('created_at').limit(1);
  if (error) throw new Error(error.message);
  return data?.[0] ?? null;
}
