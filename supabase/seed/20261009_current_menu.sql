-- TR Help kitchen: current menu (from the 2026-10-08 Hotplate prep list and
-- docs/packaging-setup.csv). Recipes are created as empty shells: the planner
-- lists each one under "Needs setup" until its ingredients are entered.
--
-- Left out on purpose (stay under "Needs setup" until answered):
--   * Chicken veggie pasta: casserole (8+4) or standard (4+4+4)?
--   * Ribs family size: cooked weight per rack unknown.
--
-- Re-runnable: everything is looked up by name before inserting.

select set_config('seed.kitchen', (select id::text from public.kitchens where name = 'TR Help'), false);

create function pg_temp.k() returns uuid language sql stable as $$ select current_setting('seed.kitchen')::uuid $$;

create function pg_temp.container(n text, cost_only boolean default false) returns uuid language plpgsql as $$
declare r uuid;
begin
  select id into r from public.container_types where kitchen_id = pg_temp.k() and name = n;
  if r is null then
    insert into public.container_types (kitchen_id, name, cost_only) values (pg_temp.k(), n, cost_only) returning id into r;
  end if;
  return r;
end $$;

create function pg_temp.recipe(n text, m text default null) returns uuid language plpgsql as $$
declare r uuid;
begin
  select id into r from public.kitchen_recipes where kitchen_id = pg_temp.k() and lower(name) = lower(n) and v1_id is null;
  if r is null then
    insert into public.kitchen_recipes (kitchen_id, name, method) values (pg_temp.k(), n, m) returning id into r;
  end if;
  return r;
end $$;

create function pg_temp.item(n text, kind text default 'meal', side_oz numeric default null) returns uuid language plpgsql as $$
declare r uuid;
begin
  select id into r from public.menu_items where kitchen_id = pg_temp.k() and name = n;
  if r is null then
    insert into public.menu_items (kitchen_id, name, kind, side_oz) values (pg_temp.k(), n, kind, side_oz) returning id into r;
  end if;
  return r;
end $$;

-- Creates or replaces a size with its portions and packaging.
-- portions: array of [recipe name, oz]; packs: array of [container, qty, contents].
create function pg_temp.size(item uuid, variation text, labels int, portions text[][], packs text[][]) returns void language plpgsql as $$
declare s uuid; i int;
begin
  delete from public.menu_sizes ms where ms.menu_item_id = item and ms.variation = size.variation;
  insert into public.menu_sizes (kitchen_id, menu_item_id, variation, labels)
  values (pg_temp.k(), item, size.variation, size.labels) returning id into s;
  for i in 1 .. coalesce(array_length(portions, 1), 0) loop
    insert into public.size_portions (kitchen_id, size_id, recipe_id, oz)
    values (pg_temp.k(), s, pg_temp.recipe(portions[i][1]), portions[i][2]::numeric);
  end loop;
  for i in 1 .. coalesce(array_length(packs, 1), 0) loop
    insert into public.size_packaging (kitchen_id, size_id, container_id, qty, contents)
    values (pg_temp.k(), s, pg_temp.container(packs[i][1]), packs[i][2]::int, packs[i][3]);
  end loop;
end $$;

-- Containers (kitchen-editable list).
select pg_temp.container(n) from unnest(array[
  '16 oz deli', '24 oz deli', '32 oz deli', '24 oz long', '24 oz deep', '24 oz divided',
  '24 oz flat plate', '24 oz long plate', '4 oz styro cup', '2 oz condiment cup',
  'Clamshell - hamburger size', 'Clamshell - plate size'
]) n;
select pg_temp.container('Plastic wrap', true);

-- Component recipes with their primary cooking method (null = not set yet).
select pg_temp.recipe(n, m) from (values
  ('Mississippi Pork Roast', 'braise'), ('Mashed Potatoes', 'boil'), ('Boiled Potatoes', 'boil'), ('Honey Glazed Carrots', null),
  ('Shrimp', 'saute'), ('Cheesy Grits', 'boil'), ('Brussels Sprouts', 'roast'),
  ('Ribs', 'smoke'), ('Corn Niblets', null), ('Potato Salad', 'boil'), ('BBQ Sauce', 'no-cook'),
  ('Pulled Chicken', 'smoke'), ('Smoked Brisket', 'smoke'),
  ('Smoked Mac & Cheese', 'smoke'), ('Broccoli', null), ('Broccoli Cheddar Soup', null)
) v(n, m);

-- Standard meals: 4/4/4 regular, 16/16/16 family.
select pg_temp.size(pg_temp.item('Mississippi Pork Roast'), 'regular', 1,
  array[['Mississippi Pork Roast','4'],['Mashed Potatoes','4'],['Honey Glazed Carrots','4']],
  array[['24 oz divided','1','Meal']]);
select pg_temp.size(pg_temp.item('Mississippi Pork Roast'), 'family', 3,
  array[['Mississippi Pork Roast','16'],['Mashed Potatoes','16'],['Honey Glazed Carrots','16']],
  array[['24 oz long plate','3','Meal']]);

select pg_temp.size(pg_temp.item('Shrimp & Grits with Brussels sprouts'), 'regular', 1,
  array[['Shrimp','4'],['Cheesy Grits','4'],['Brussels Sprouts','4']],
  array[['24 oz long plate','1','Meal']]);
select pg_temp.size(pg_temp.item('Shrimp & Grits with Brussels sprouts'), 'family', 3,
  array[['Shrimp','16'],['Cheesy Grits','16'],['Brussels Sprouts','16']],
  array[['24 oz long plate','3','Meal']]);

-- Ribs: blank option = 4 oz. Potato salad cup holds 3.75 oz, BBQ cup 1.5 oz.
select pg_temp.size(pg_temp.item('Ribs with Corn Niblets & Potato Salad'), 'regular', 1,
  array[['Ribs','4'],['Corn Niblets','4'],['Potato Salad','3.75'],['BBQ Sauce','1.5']],
  array[['24 oz long plate','1','Ribs + corn'],['4 oz styro cup','1','Potato salad'],['2 oz condiment cup','1','BBQ sauce']]);

-- Casserole: 8 oz mac + 4 oz broccoli; the "6 OZ" option means +2 oz mac.
select pg_temp.size(pg_temp.item('Smoked Mac & Cheese with Broccoli'), 'regular', 1,
  array[['Smoked Mac & Cheese','8'],['Broccoli','4']], array[['24 oz long plate','1','Meal']]);
select pg_temp.size(pg_temp.item('Smoked Mac & Cheese with Broccoli'), '6 oz', 1,
  array[['Smoked Mac & Cheese','10'],['Broccoli','4']], array[['24 oz long plate','1','Meal']]);

select pg_temp.size(pg_temp.item('Broccoli Cheddar Soup'), 'regular', 1,
  array[['Broccoli Cheddar Soup','16']], array[['16 oz deli','1','Soup']]);
select pg_temp.size(pg_temp.item('Broccoli Cheddar Soup'), '24 ounces', 1,
  array[['Broccoli Cheddar Soup','24']], array[['24 oz deli','1','Soup']]);

-- By the pound: 16 oz finished + 4 oz styro of BBQ (3.5 oz fill).
select pg_temp.size(pg_temp.item('Pulled Chicken by the pound'), 'regular', 1,
  array[['Pulled Chicken','16'],['BBQ Sauce','3.5']],
  array[['24 oz long plate','1','Meat'],['4 oz styro cup','1','BBQ sauce']]);
select pg_temp.size(pg_temp.item('Smoked Beef by the pound'), 'regular', 1,
  array[['Smoked Brisket','16'],['BBQ Sauce','3.5']],
  array[['24 oz long plate','1','Meat'],['4 oz styro cup','1','BBQ sauce']]);

-- Garden plate: up to 3 sides, 4 oz each. The "- Menu X" suffix is ignored when matching.
select pg_temp.size(pg_temp.item('Garden Vegetable and Sides', 'sidePlate', 4), 'regular', 1,
  array[]::text[][], array[['24 oz long plate','1','Sides']]);
insert into public.side_links (kitchen_id, side_name, recipe_id)
select pg_temp.k(), s, pg_temp.recipe(s)
from unnest(array['Potato Salad', 'Brussels Sprouts', 'Broccoli', 'Honey Glazed Carrots', 'Corn Niblets']) s
on conflict (kitchen_id, side_name) do update set recipe_id = excluded.recipe_id;

-- Kitchen-measured yields known so far.
insert into public.ingredients (kitchen_id, name, yield, yield_source) values
  (pg_temp.k(), 'Brisket (packer)', 0.50, 'kitchen'),
  (pg_temp.k(), 'Pork butt', 0.45, 'kitchen')
on conflict do nothing;
