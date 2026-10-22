-- Kitchen 2026-10-15 (4):
--   * Broth is Better Than Bouillon: 1 tsp per 1 cup water. Recipes read "_ cups water; _ tsp BTB".
--   * Boil: potatoes, broccoli, green beans share salted water; russet and red potatoes boil
--     together. Rice is its own pot. Soups, sauces, gravy and grits move to a Simmer station.
--   * Soy sauce is a staple.
-- Re-runnable. All derived amounts are computed here in SQL from stored values.

select set_config('seed.kitchen', (select id::text from public.kitchens where name = 'TR Help'), false);
create or replace function pg_temp.k() returns uuid language sql stable as $$ select current_setting('seed.kitchen')::uuid $$;
create or replace function pg_temp.recipe(n text, m text default null) returns uuid language plpgsql as $$
declare r uuid;
begin
  select id into r from public.kitchen_recipes where kitchen_id = pg_temp.k() and lower(name) = lower(n) order by (v1_id is null) desc limit 1;
  if r is null then insert into public.kitchen_recipes (kitchen_id, name, method) values (pg_temp.k(), n, m) returning id into r; end if;
  return r;
end $$;
create or replace function pg_temp.ing(n text) returns uuid language sql stable as $$
  select id from public.ingredients where kitchen_id = pg_temp.k() and lower(name) = lower(n)
$$;

-- ── Broth = water + Better Than Bouillon ────────────────────────────────────
update public.ingredients set name = 'Better Than Bouillon, chicken', purchase_unit = 'tsp', purchase_oz = 0.21, staple = true
where kitchen_id = pg_temp.k() and name in ('Better Than Bouillon chicken base (+ water)', 'Better Than Bouillon, chicken');
insert into public.ingredients (kitchen_id, name, yield, yield_source, staple, purchase_unit, purchase_oz, category)
select pg_temp.k(), 'Water', 1, 'kitchen', true, 'cups', 8.345, 'Water'
where pg_temp.ing('Water') is null;

select pg_temp.recipe('Chicken Broth', 'no-cook');  -- create first: an UPDATE can't see a row its own WHERE inserts
update public.kitchen_recipes set method = 'no-cook', on_prep_sheet = false,
  notes = 'Better Than Bouillon per package: 1 tsp per 1 cup water. Mixed into the dish, no prep line.'
where id = pg_temp.recipe('Chicken Broth', 'no-cook');
delete from public.recipe_lines where recipe_id = pg_temp.recipe('Chicken Broth');
insert into public.recipe_lines (kitchen_id, recipe_id, position, amount, unit, raw_name, oz, ingredient_id, note) values
  (pg_temp.k(), pg_temp.recipe('Chicken Broth'), 1, 1, 'cup', 'water', 8.345, pg_temp.ing('Water'), 'kitchen ok'),
  (pg_temp.k(), pg_temp.recipe('Chicken Broth'), 2, 1, 'tsp', 'Better Than Bouillon, chicken', 0.21, pg_temp.ing('Better Than Bouillon, chicken'), 'kitchen ok');

-- Dishes that used "broth" now use the Chicken Broth recipe (same weight).
update public.recipe_lines set ingredient_id = null, sub_recipe_id = pg_temp.recipe('Chicken Broth')
where kitchen_id = pg_temp.k() and ingredient_id = pg_temp.ing('Better Than Bouillon, chicken')
  and recipe_id <> pg_temp.recipe('Chicken Broth');

-- ── Red potatoes boil with the russets ──────────────────────────────────────
select pg_temp.recipe('Boiled Red Potatoes', 'boil');
delete from public.recipe_lines where recipe_id = pg_temp.recipe('Boiled Red Potatoes');
insert into public.recipe_lines (kitchen_id, recipe_id, position, amount, unit, raw_name, oz, ingredient_id, note)
values (pg_temp.k(), pg_temp.recipe('Boiled Red Potatoes'), 1, 1, 'lb', 'red potatoes, skin on', 16, pg_temp.ing('Red potatoes'), 'estimate');
-- German Potato Salad: raw red potatoes line → cooked Boiled Red Potatoes (raw oz × yield).
update public.recipe_lines l set ingredient_id = null, sub_recipe_id = pg_temp.recipe('Boiled Red Potatoes'),
  oz = l.oz * (select yield from public.ingredients where id = pg_temp.ing('Red potatoes')),
  raw_name = 'red potatoes, boiled'
where l.recipe_id = pg_temp.recipe('German Potato Salad') and l.ingredient_id = pg_temp.ing('Red potatoes');

-- ── Stations and pots ───────────────────────────────────────────────────────
update public.kitchen_recipes set prep_group = 'Salted water'
where kitchen_id = pg_temp.k() and name in ('Boiled Russet Potatoes', 'Boiled Red Potatoes', 'Green Beans', 'Broccoli', 'Broccoli Rabe');
update public.kitchen_recipes set prep_group = 'Rice' where kitchen_id = pg_temp.k() and name = 'Cooked Rice';
update public.kitchen_recipes set method = 'simmer'
where kitchen_id = pg_temp.k() and name in ('Chicken Noodle Soup', 'Broccoli Cheddar Soup', 'Gravy', 'Cheesy Grits');

update public.ingredients set staple = true where kitchen_id = pg_temp.k() and name = 'Soy sauce';

-- Broth lines measured in cups weigh cups × one broth batch (1 cup water + 1 tsp base),
-- so the dish's card and the broth card agree.
update public.recipe_lines l set oz = l.amount * (
  select sum(b.oz) from public.recipe_lines b where b.recipe_id = pg_temp.recipe('Chicken Broth'))
where l.kitchen_id = pg_temp.k() and l.sub_recipe_id = pg_temp.recipe('Chicken Broth') and l.unit in ('cup', 'cups');
