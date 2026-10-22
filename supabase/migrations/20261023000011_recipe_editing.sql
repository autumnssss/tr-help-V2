-- Recipes are edited in the app (kitchen 2026-10-23): everyone with a login can edit, and every save keeps
-- the version it replaces (who and when), so a bad edit can be put back.

-- Weight of one "each" (1 onion, 1 clove), for lines counted rather than weighed. grams_per_cup (from the
-- first migration) covers cups and spoons. Both are entered by the kitchen the first time they're needed.
alter table public.ingredients add column grams_per_each numeric check (grams_per_each > 0);

create table public.recipe_versions (
  id uuid primary key default gen_random_uuid(),
  kitchen_id uuid not null default public.default_kitchen_id() references public.kitchens(id) on delete cascade,
  recipe_id uuid not null,
  saved_at timestamptz not null default now(),
  saved_by uuid default auth.uid(),
  saved_by_email text,
  -- The recipe row and its lines as they were before the save.
  recipe jsonb not null,
  lines jsonb not null
);
create index on public.recipe_versions (recipe_id, saved_at desc);
alter table public.recipe_versions enable row level security;
create policy "kitchen members" on public.recipe_versions for all to authenticated
  using (kitchen_id in (select public.my_kitchen_ids()))
  with check (kitchen_id in (select public.my_kitchen_ids()));

-- Save a recipe and its lines in one go. Runs as the caller (row-level security applies).
-- p_recipe: {id?, name, method, prep_group, on_prep_sheet, notes, steps, finished_oz, finished_oz_measured,
--            yield_count, yield_unit, oz_per_piece, archived}
-- p_lines:  [{amount, unit, raw_name, note, ingredient_id, sub_recipe_id, oz}] in order.
create function public.save_recipe(p_recipe jsonb, p_lines jsonb, p_by text default null) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  r_id uuid := nullif(p_recipe->>'id', '')::uuid;
  k uuid;
begin
  if r_id is not null then
    insert into public.recipe_versions (kitchen_id, recipe_id, saved_by_email, recipe, lines)
    select r.kitchen_id, r.id, p_by, to_jsonb(r) - 'v1_data',
      coalesce((select jsonb_agg(to_jsonb(l) order by l.position) from public.recipe_lines l where l.recipe_id = r.id), '[]'::jsonb)
    from public.kitchen_recipes r where r.id = r_id;
    if not found then raise exception 'Recipe not found (or not in your kitchen)'; end if;
    update public.kitchen_recipes set
      name = p_recipe->>'name',
      method = nullif(p_recipe->>'method', ''),
      prep_group = nullif(p_recipe->>'prep_group', ''),
      on_prep_sheet = coalesce((p_recipe->>'on_prep_sheet')::boolean, true),
      notes = coalesce(p_recipe->>'notes', ''),
      steps = coalesce(p_recipe->>'steps', ''),
      finished_oz = (p_recipe->>'finished_oz')::numeric,
      finished_oz_measured = coalesce((p_recipe->>'finished_oz_measured')::boolean, false),
      yield_count = (p_recipe->>'yield_count')::numeric,
      yield_unit = nullif(p_recipe->>'yield_unit', ''),
      oz_per_piece = (p_recipe->>'oz_per_piece')::numeric,
      archived = coalesce((p_recipe->>'archived')::boolean, false)
    where id = r_id;
  else
    insert into public.kitchen_recipes (name, method, prep_group, on_prep_sheet, notes, steps, finished_oz,
      finished_oz_measured, yield_count, yield_unit, oz_per_piece, archived)
    values (p_recipe->>'name', nullif(p_recipe->>'method', ''), nullif(p_recipe->>'prep_group', ''),
      coalesce((p_recipe->>'on_prep_sheet')::boolean, true), coalesce(p_recipe->>'notes', ''), coalesce(p_recipe->>'steps', ''),
      (p_recipe->>'finished_oz')::numeric, coalesce((p_recipe->>'finished_oz_measured')::boolean, false),
      (p_recipe->>'yield_count')::numeric, nullif(p_recipe->>'yield_unit', ''), (p_recipe->>'oz_per_piece')::numeric,
      coalesce((p_recipe->>'archived')::boolean, false))
    returning id into r_id;
  end if;

  select kitchen_id into k from public.kitchen_recipes where id = r_id;
  delete from public.recipe_lines where recipe_id = r_id;
  insert into public.recipe_lines (kitchen_id, recipe_id, position, amount, unit, raw_name, note, ingredient_id, sub_recipe_id, oz)
  select k, r_id, t.ord::int, (t.l->>'amount')::numeric, coalesce(t.l->>'unit', ''), coalesce(t.l->>'raw_name', ''),
    coalesce(t.l->>'note', ''), nullif(t.l->>'ingredient_id', '')::uuid, nullif(t.l->>'sub_recipe_id', '')::uuid, (t.l->>'oz')::numeric
  from jsonb_array_elements(p_lines) with ordinality as t(l, ord);
  return r_id;
end $$;
grant execute on function public.save_recipe(jsonb, jsonb, text) to authenticated;
