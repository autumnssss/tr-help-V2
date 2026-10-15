-- Kitchen 2026-10-15 (5): how each V1 recipe is scaled. Weights computed here in SQL from
-- the stated amounts (1 cup cream = 8 oz per the kitchen; 1 large egg ≈ 2 oz).
-- Re-runnable.

select set_config('seed.kitchen', (select id::text from public.kitchens where name = 'TR Help'), false);
create or replace function pg_temp.k() returns uuid language sql stable as $$ select current_setting('seed.kitchen')::uuid $$;
create or replace function pg_temp.r(n text) returns uuid language sql stable as $$
  select id from public.kitchen_recipes where kitchen_id = pg_temp.k() and name = n order by (v1_id is null) limit 1
$$;
create or replace function pg_temp.ing(n text, y numeric default 1) returns uuid language plpgsql as $$
declare r uuid;
begin
  select id into r from public.ingredients where kitchen_id = pg_temp.k() and lower(name) = lower(n);
  if r is null then insert into public.ingredients (kitchen_id, name, yield, yield_source) values (pg_temp.k(), n, y, 'estimate') returning id into r; end if;
  return r;
end $$;
-- Link one line (matched by its text) to an ingredient, optionally setting its weight.
create or replace function pg_temp.link(recipe text, line text, ingredient text, oz numeric default null, rename text default null) returns void language sql as $$
  update public.recipe_lines set ingredient_id = pg_temp.ing(ingredient), oz = coalesce(link.oz, recipe_lines.oz),
    raw_name = coalesce(rename, raw_name)
  where recipe_id = pg_temp.r(recipe) and raw_name = line
$$;

-- ── By count ────────────────────────────────────────────────────────────────
update public.kitchen_recipes k set yield_count = v.n, yield_unit = v.unit
from (values ('Rice Crispy Treats', 12, 'treats'), ('Chocolate Espresso Quick Bread', 5, 'loaves'),
             ('Carrot Cake/Bread', 4, 'loaves'), ('Best Ever Chocolate Cake', 1, '8" triple-layer cake'),
             ('Pie Crust', 5, '9" crusts')) v(name, n, unit)
where k.kitchen_id = pg_temp.k() and k.name = v.name;

-- ── Not made ────────────────────────────────────────────────────────────────
update public.kitchen_recipes set archived = true where kitchen_id = pg_temp.k() and name = 'Coq Au Vin';

-- ── Eggs ≈ 2 oz each (large) ────────────────────────────────────────────────
update public.ingredients set purchase_oz = 2 where kitchen_id = pg_temp.k() and name = 'Eggs';
update public.recipe_lines set oz = amount * 2
where kitchen_id = pg_temp.k() and ingredient_id = pg_temp.ing('Eggs') and unit = 'large' and amount is not null;

-- ── Chicken Tikka Masala: weight = chicken + 15 oz tomato sauce + 1/2 C (4 oz) cream; spices scale but don't count
select pg_temp.ing('Tomato sauce, canned', 1);
select pg_temp.link('Chicken Tikka Masala', 'chicken breasts', 'Chicken breast, boneless skinless');
select pg_temp.link('Chicken Tikka Masala', 'tomato sauce', 'Tomato sauce, canned');
update public.recipe_lines set ingredient_id = pg_temp.ing('Heavy cream'), oz = amount * 8
where recipe_id = pg_temp.r('Chicken Tikka Masala') and raw_name = 'heavy cream';

-- ── Butter Chicken and Quick Chicken Tikka Masala (same recipe): breasts, 15 oz tomato sauce, 2 C cream
select pg_temp.link(n, 'skinless boneless chicken thighs', 'Chicken breast, boneless skinless', null, 'skinless boneless chicken breasts')
from unnest(array['Butter Chicken', 'Quick Chicken Tikka Masala']) n;
select pg_temp.link(n, 'tomato sauce', 'Tomato sauce, canned') from unnest(array['Butter Chicken', 'Quick Chicken Tikka Masala']) n;
update public.recipe_lines set ingredient_id = pg_temp.ing('Heavy cream'), oz = amount * 8
where recipe_id in (pg_temp.r('Butter Chicken'), pg_temp.r('Quick Chicken Tikka Masala')) and raw_name = 'heavy cream';

-- ── Cauliflower & Peas: 24 oz cauliflower + 10 oz frozen peas = the batch ───
select pg_temp.link('Cauliflower & Peas', 'cauliflower', 'Cauliflower');
select pg_temp.link('Cauliflower & Peas', 'Peas', 'Frozen peas');
update public.kitchen_recipes set finished_oz = (select sum(oz) from public.recipe_lines where recipe_id = pg_temp.r('Cauliflower & Peas'))
where id = pg_temp.r('Cauliflower & Peas');

-- ── Meatballs: 80/20, egg 2 oz, 3/4 C crumbs 6 oz, 1/2 C parm 4 oz; spices don't count
select pg_temp.link('Meatballs - Italian', 'hamburger 70% lean', 'Ground beef 80/20', null, 'ground beef 80/20');
select pg_temp.ing('Hot Italian sausage, bulk', 0.75);
select pg_temp.link('Meatballs - Italian', 'hot bulk Italian sausage', 'Hot Italian sausage, bulk');
select pg_temp.link('Meatballs - Italian', 'eggs', 'Eggs');
update public.recipe_lines set oz = amount * 2 where recipe_id = pg_temp.r('Meatballs - Italian') and raw_name = 'eggs';
select pg_temp.link('Meatballs - Italian', 'breadcrumbs', 'Breadcrumbs', 6);
select pg_temp.link('Meatballs - Italian', 'grated dry Parmesan cheese', 'Parmesan, grated', 4);

-- Kitchen 2026-10-15: delete Quick Chicken Tikka Masala (duplicate of Butter Chicken).
delete from public.kitchen_recipes where kitchen_id = pg_temp.k() and name = 'Quick Chicken Tikka Masala';
