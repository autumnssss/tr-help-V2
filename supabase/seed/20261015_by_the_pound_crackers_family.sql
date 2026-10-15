-- Kitchen answers 2026-10-15:
--   * Gravy and Thai Chicken recipes confirmed.
--   * By the pound = the meat + a rub (house-made or store-bought; to be standardized).
--   * BBQ sauce = Head Country Original, bought by the gallon.
--   * Soup crackers: prepackaged oyster crackers, 1 pack (16 oz), 2 (24 oz), 4 (32 oz).
--   * Smoked cream cheese is sold by the 8 oz block.
--   * Family packs: Meatloaf and Teriyaki 1 lb of each part; Thai 1 lb chicken, ~1/2 lb
--     salad, 1 lb carrots + bell peppers + limes, 4 oz styro of peanut sauce.
-- Family packaging was not given: those sizes use a "TBD - family packaging" container
-- so the container count shows the gap instead of hiding it.
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

-- ── Confirmed by the kitchen ────────────────────────────────────────────────
update public.recipe_lines set note = 'kitchen ok'
where recipe_id in (pg_temp.recipe('Gravy'), pg_temp.recipe('Thai Chicken'));

-- ── By the pound: meat + rub ────────────────────────────────────────────────
select pg_temp.ingredient('BBQ rub', 1);
select pg_temp.ingredient('Brisket (packer)', 0.50, 'kitchen');
select pg_temp.set_lines(pg_temp.recipe('Smoked Brisket', 'smoke'), 'estimate', array[
  ['1',   'lb', 'brisket (packer)', '16',  'Brisket (packer)', 'ing'],
  ['0.5', 'oz', 'rub',              '0.5', 'BBQ rub',          'ing']]);
update public.kitchen_recipes set notes = 'Rub is house-made or store-bought; to be standardized.' where id = pg_temp.recipe('Smoked Brisket');

-- Head Country Original, by the gallon (~9.4 lb per gallon).
select pg_temp.ingredient('Head Country BBQ sauce, Original', 1, 'estimate', 'gallon', 150);
select pg_temp.set_lines(pg_temp.recipe('BBQ Sauce', 'no-cook'), 'kitchen ok', array[
  ['1', 'gallon', 'Head Country Original', '150', 'Head Country BBQ sauce, Original', 'ing']]);

-- ── Oyster crackers with soup (counted in packs) ────────────────────────────
select pg_temp.ingredient('Oyster crackers, individual packs', 1, 'estimate', 'pack', 0.5);
select pg_temp.set_lines(pg_temp.recipe('Oyster Crackers', 'no-cook'), 'kitchen ok', array[
  ['1', 'pack', 'oyster crackers', '0.5', 'Oyster crackers, individual packs', 'ing']]);
update public.kitchen_recipes set oz_per_piece = 0.5 where id = pg_temp.recipe('Oyster Crackers');
insert into public.size_portions (kitchen_id, size_id, recipe_id, pieces)
select pg_temp.k(), s.id, pg_temp.recipe('Oyster Crackers'),
       case s.variation when 'regular' then 1 when '24 ounces' then 2 when '32 ounces' then 4 end
from public.menu_sizes s join public.menu_items m on m.id = s.menu_item_id
where m.kitchen_id = pg_temp.k() and m.name in ('Chicken Noodle Soup', 'Broccoli Cheddar Soup')
  and s.variation in ('regular', '24 ounces', '32 ounces')
  and not exists (select 1 from public.size_portions p where p.size_id = s.id and p.recipe_id = pg_temp.recipe('Oyster Crackers'));

-- ── Smoked cream cheese, by the 8 oz block ──────────────────────────────────
select pg_temp.ingredient('Cream cheese, 8 oz block', 1, 'estimate', 'block', 8);
select pg_temp.set_lines(pg_temp.recipe('Smoked Cream Cheese', 'smoke'), 'estimate', array[
  ['1',    'block', 'cream cheese (8 oz)', '8',    'Cream cheese, 8 oz block', 'ing'],
  ['0.25', 'oz',    'rub',                 '0.25', 'BBQ rub',                  'ing']]);
update public.kitchen_recipes set oz_per_piece = 8.25 where id = pg_temp.recipe('Smoked Cream Cheese');
select pg_temp.size(pg_temp.item('Smoked Cream Cheese'), 'regular', 1, array[['Smoked Cream Cheese','1 pcs']], array[]::text[][]);

-- ── Family packs ─────────────────────────────────────────────────────────────
select pg_temp.size(pg_temp.item('Home style Meatloaf with Mashed Potatoes, gravy and Green Beans'), 'family', 3,
  array[['Meatloaf','16'],['Mashed Potatoes','16'],['Green Beans','16'],['Gravy','8']],
  array[['TBD - family packaging','1','Meal']]);
select pg_temp.size(pg_temp.item('Chicken Teriyaki'), 'family', 3,
  array[['Chicken Teriyaki','16'],['Fried Rice','16'],['Broccoli Rabe','16']],
  array[['TBD - family packaging','1','Meal']]);
select pg_temp.size(pg_temp.item('Thai Chicken Lettuce Bowl with Peanut Sauce'), 'family', 3,
  array[['Thai Chicken','16'],['Romaine Lettuce','8'],['Shredded Carrots','7'],['Sliced Bell Peppers','7'],
        ['Lime Slices','6 pcs'],['Chopped Cilantro','0.4'],['Peanut Sauce','3.5']],
  array[['TBD - family packaging','1','Bowl'],['4 oz styro cup','1','Peanut sauce']]);
