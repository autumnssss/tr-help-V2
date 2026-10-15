-- Kitchen answers 2026-10-15 (2):
--   * Family packs go in 3 × 28 oz single-compartment plates, except family ribs:
--     rack wrapped in foil + 2 plates for the sides.
--   * Reuben family = 2 lb casserole + 1 lb German potato salad.
-- From the 2026-10-14 prep list:
--   * Meatloaf has a "6 OZ" option (assumed +2 oz meatloaf, like Mac & Cheese).
--   * Reuben comes with a dill pickle spear (assumed 1 per regular, 3 per family).
-- Re-runnable.
select set_config('seed.kitchen', (select id::text from public.kitchens where name = 'TR Help'), false);

create or replace function pg_temp.k() returns uuid language sql stable as $$ select current_setting('seed.kitchen')::uuid $$;

create or replace function pg_temp.recipe(n text, m text default null) returns uuid language plpgsql as $$
declare r uuid;
begin
  select id into r from public.kitchen_recipes where kitchen_id = pg_temp.k() and lower(name) = lower(n)
  order by (v1_id is null) desc limit 1;
  if r is null then insert into public.kitchen_recipes (kitchen_id, name, method) values (pg_temp.k(), n, m) returning id into r;
  elsif m is not null then update public.kitchen_recipes set method = m where id = r;
  end if;
  return r;
end $$;

create or replace function pg_temp.ingredient(n text, y numeric, src text default 'estimate', unit text default null, unit_oz numeric default null) returns uuid language plpgsql as $$
declare r uuid;
begin
  select id into r from public.ingredients where kitchen_id = pg_temp.k() and lower(name) = lower(n);
  if r is null then
    insert into public.ingredients (kitchen_id, name, yield, yield_source, purchase_unit, purchase_oz)
    values (pg_temp.k(), n, y, src, unit, unit_oz) returning id into r;
  else
    update public.ingredients set purchase_unit = coalesce(unit, purchase_unit), purchase_oz = coalesce(unit_oz, purchase_oz) where id = r;
  end if;
  return r;
end $$;

create or replace function pg_temp.set_lines(recipe uuid, note text, lines text[][]) returns void language plpgsql as $$
declare i int;
begin
  delete from public.recipe_lines where recipe_id = recipe;
  for i in 1 .. array_length(lines, 1) loop
    insert into public.recipe_lines (kitchen_id, recipe_id, position, amount, unit, raw_name, oz, ingredient_id, note)
    values (pg_temp.k(), recipe, i, nullif(lines[i][1], '')::numeric, lines[i][2], lines[i][3], lines[i][4]::numeric,
            (select id from public.ingredients where kitchen_id = pg_temp.k() and lower(name) = lower(lines[i][5])), set_lines.note);
  end loop;
end $$;

create or replace function pg_temp.container(n text) returns uuid language plpgsql as $$
declare r uuid;
begin
  select id into r from public.container_types where kitchen_id = pg_temp.k() and name = n;
  if r is null then insert into public.container_types (kitchen_id, name) values (pg_temp.k(), n) returning id into r; end if;
  return r;
end $$;

create or replace function pg_temp.item(n text, kind text default 'meal') returns uuid language plpgsql as $$
declare r uuid;
begin
  select id into r from public.menu_items where kitchen_id = pg_temp.k() and name = n;
  if r is null then insert into public.menu_items (kitchen_id, name, kind) values (pg_temp.k(), n, kind) returning id into r; end if;
  return r;
end $$;

-- portions: [recipe, '4' (oz) or '2 pcs']; packs: [container, qty, contents]
create or replace function pg_temp.size(item uuid, variation text, labels int, portions text[][], packs text[][]) returns void language plpgsql as $$
declare s uuid; i int; amt text;
begin
  delete from public.menu_sizes ms where ms.menu_item_id = item and ms.variation = size.variation;
  insert into public.menu_sizes (kitchen_id, menu_item_id, variation, labels) values (pg_temp.k(), item, size.variation, size.labels) returning id into s;
  for i in 1 .. coalesce(array_length(portions, 1), 0) loop
    amt := portions[i][2];
    insert into public.size_portions (kitchen_id, size_id, recipe_id, oz, pieces)
    values (pg_temp.k(), s, pg_temp.recipe(portions[i][1]),
            case when amt like '%pcs' then null else amt::numeric end,
            case when amt like '%pcs' then split_part(amt, ' ', 1)::numeric end);
  end loop;
  for i in 1 .. coalesce(array_length(packs, 1), 0) loop
    insert into public.size_packaging (kitchen_id, size_id, container_id, qty, contents)
    values (pg_temp.k(), s, pg_temp.container(packs[i][1]), packs[i][2]::int, packs[i][3]);
  end loop;
end $$;

-- Family packs: 3 × 28 oz single-compartment plate.
update public.size_packaging set container_id = pg_temp.container('28 oz plate'), qty = 3
where container_id = pg_temp.container('TBD - family packaging');
delete from public.container_types where kitchen_id = pg_temp.k() and name = 'TBD - family packaging'
  and not exists (select 1 from public.size_packaging p where p.container_id = public.container_types.id);

-- Reuben: pickle spear, and the family pack.
select pg_temp.ingredient('Dill pickle spears', 1);
select pg_temp.set_lines(pg_temp.recipe('Dill Pickle Spear', 'no-cook'), 'estimate', array[
  ['1', 'spear', 'dill pickle spear', '1.2', 'Dill pickle spears', 'ing']]);
update public.kitchen_recipes set oz_per_piece = 1.2 where id = pg_temp.recipe('Dill Pickle Spear');
select pg_temp.size(pg_temp.item('Ruben Casserole with potato salad'), 'regular', 1,
  array[['Ruben Casserole','8'],['German Potato Salad','4'],['Dill Pickle Spear','1 pcs']],
  array[['28 oz divided plate','1','Meal']]);
select pg_temp.size(pg_temp.item('Ruben Casserole with potato salad'), 'family', 3,
  array[['Ruben Casserole','32'],['German Potato Salad','16'],['Dill Pickle Spear','3 pcs']],
  array[['28 oz plate','3','Meal']]);

-- Meatloaf 6 oz option.
select pg_temp.size(pg_temp.item('Home style Meatloaf with Mashed Potatoes, gravy and Green Beans'), '6 oz', 1,
  array[['Meatloaf','6'],['Mashed Potatoes','4'],['Green Beans','4'],['Gravy','2']],
  array[['28 oz long plate','1','Meal']]);

-- Family ribs: 1 rack in foil + corn and potato salad on 2 plates. The rack's cooked
-- weight is still unknown, so this size flags "no weight per piece" until it's given.
select pg_temp.size(pg_temp.item('Ribs with Corn Niblets & Potato Salad'), 'family', 2,
  array[['Ribs','1 pcs'],['Corn Niblets','16'],['Potato Salad','16'],['BBQ Sauce','3.5']],
  array[['24 oz flat plate','2','Sides'],['Foil','1','Rack'],['4 oz styro cup','1','BBQ sauce']]);
update public.container_types set cost_only = true where kitchen_id = pg_temp.k() and name = 'Foil';
