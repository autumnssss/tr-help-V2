-- TR Help kitchen: menu for the 2026-10-12 drop, plus starting recipes for simple
-- items. Every yield and ratio marked 'estimate' is a placeholder until the
-- kitchen weighs a real batch. Re-runnable: everything is looked up by name.
--
-- Not set up on purpose (stay under "Needs setup" until answered):
--   * Family sizes for Meatloaf, Chicken Teriyaki, Thai Chicken Lettuce Bowl,
--     Ruben Casserole: containers and portions not given yet.
--   * Crackers with Chicken Noodle Soup: count not given yet.
--   * Smoked Cream Cheese: how it's sold not given yet.
--   * Recipes still needed: Meatloaf (V1 copy, unlinked), Gravy, Chicken
--     Teriyaki, Fried Rice, Thai Chicken, Peanut Sauce, Ruben Casserole, Chicken
--     Noodle Soup, Cheesy Grits, German Potato Salad, Smoked Salmon.

select set_config('seed.kitchen', (select id::text from public.kitchens where name = 'TR Help'), false);

create or replace function pg_temp.k() returns uuid language sql stable as $$ select current_setting('seed.kitchen')::uuid $$;

create or replace function pg_temp.container(n text) returns uuid language plpgsql as $$
declare r uuid;
begin
  select id into r from public.container_types where kitchen_id = pg_temp.k() and name = n;
  if r is null then insert into public.container_types (kitchen_id, name) values (pg_temp.k(), n) returning id into r; end if;
  return r;
end $$;

-- V2 recipe by name; falls back to the V1 copy (e.g. Meatloaf) before creating a new one.
create or replace function pg_temp.recipe(n text, m text default null) returns uuid language plpgsql as $$
declare r uuid;
begin
  select id into r from public.kitchen_recipes where kitchen_id = pg_temp.k() and lower(name) = lower(n)
  order by (v1_id is null) desc limit 1;
  if r is null then insert into public.kitchen_recipes (kitchen_id, name, method) values (pg_temp.k(), n, m) returning id into r;
  elsif m is not null then update public.kitchen_recipes set method = m where id = r and method is null;
  end if;
  return r;
end $$;

create or replace function pg_temp.ingredient(n text, y numeric, unit text default null, unit_oz numeric default null, buffer numeric default 0)
returns uuid language plpgsql as $$
declare r uuid;
begin
  select id into r from public.ingredients where kitchen_id = pg_temp.k() and lower(name) = lower(n);
  if r is null then
    insert into public.ingredients (kitchen_id, name, yield, yield_source, purchase_unit, purchase_oz, buffer, unpredictable)
    values (pg_temp.k(), n, y, 'estimate', unit, unit_oz, buffer, buffer > 0) returning id into r;
  end if;
  return r;
end $$;

-- Replaces a recipe's lines. lines: [name, oz, 'ing' | 'sub']. Only touches recipes with no lines
-- or lines this seed wrote (note = 'estimate'), so a real recipe entered later is never overwritten.
create or replace function pg_temp.estimate(recipe uuid, lines text[][]) returns void language plpgsql as $$
declare i int;
begin
  if exists (select 1 from public.recipe_lines where recipe_id = recipe and note <> 'estimate') then return; end if;
  delete from public.recipe_lines where recipe_id = recipe;
  for i in 1 .. array_length(lines, 1) loop
    insert into public.recipe_lines (kitchen_id, recipe_id, position, raw_name, oz, ingredient_id, sub_recipe_id, note)
    values (pg_temp.k(), recipe, i, lines[i][1], lines[i][2]::numeric,
            case when lines[i][3] = 'ing' then (select id from public.ingredients where kitchen_id = pg_temp.k() and lower(name) = lower(lines[i][1])) end,
            case when lines[i][3] = 'sub' then pg_temp.recipe(lines[i][1]) end,
            'estimate');
  end loop;
end $$;

create or replace function pg_temp.item(n text, kind text default 'meal', side_oz numeric default null) returns uuid language plpgsql as $$
declare r uuid;
begin
  select id into r from public.menu_items where kitchen_id = pg_temp.k() and name = n;
  if r is null then insert into public.menu_items (kitchen_id, name, kind, side_oz) values (pg_temp.k(), n, kind, side_oz) returning id into r; end if;
  return r;
end $$;

-- portions: [recipe, amount] where amount is oz ('4') or pieces ('9 pcs'); packs: [container, qty, contents].
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

create or replace function pg_temp.title(item uuid, t text) returns void language sql as $$
  insert into public.menu_titles (kitchen_id, menu_item_id, title) values (pg_temp.k(), item, t)
  on conflict (kitchen_id, title) do update set menu_item_id = excluded.menu_item_id
$$;

create or replace function pg_temp.side(n text) returns void language sql as $$
  insert into public.side_links (kitchen_id, side_name, recipe_id) values (pg_temp.k(), n, pg_temp.recipe(n))
  on conflict (kitchen_id, side_name) do update set recipe_id = excluded.recipe_id
$$;

-- ── Ingredients (estimates) ─────────────────────────────────────────────────
select pg_temp.ingredient('Russet potatoes', 0.80);          -- peeled + boiled
select pg_temp.ingredient('Butter', 1);
select pg_temp.ingredient('Heavy cream', 1);
select pg_temp.ingredient('Mayonnaise', 1);
select pg_temp.ingredient('Yellow mustard', 1);
select pg_temp.ingredient('Kosher salt', 1);
select pg_temp.ingredient('Black pepper', 1);
select pg_temp.ingredient('Green beans', 0.88);               -- ends trimmed, boiled
select pg_temp.ingredient('Broccoli crowns', 0.80);           -- trimmed, boiled
select pg_temp.ingredient('Broccoli rabe (or crowns)', 0.75); -- planned at the lower yield so a swap never runs short
select pg_temp.ingredient('Brussels sprouts', 0.75, null, null, 0.10);
select pg_temp.ingredient('Olive oil', 1);
select pg_temp.ingredient('Shrimp 20-25 ct', 0.80, '2 lb bag', 32);
select pg_temp.ingredient('Mixed greens', 0.90);
select pg_temp.ingredient('Shredded carrots', 1);
select pg_temp.ingredient('Bell peppers', 0.82);
select pg_temp.ingredient('Cilantro', 0.60);

-- ── Recipes (estimates) ─────────────────────────────────────────────────────
-- 12.5 lb raw russets → 10 lb boiled.
select pg_temp.estimate(pg_temp.recipe('Boiled Russet Potatoes', 'boil'), array[['Russet potatoes','200','ing']]);
-- ~96% potatoes, per the kitchen.
select pg_temp.estimate(pg_temp.recipe('Mashed Potatoes', 'boil'), array[
  ['Boiled Russet Potatoes','160','sub'], ['Butter','4','ing'], ['Heavy cream','2','ing'], ['Kosher salt','0.5','ing'], ['Black pepper','0.1','ing']]);
select pg_temp.estimate(pg_temp.recipe('Potato Salad', 'boil'), array[
  ['Boiled Russet Potatoes','160','sub'], ['Mayonnaise','4','ing'], ['Yellow mustard','1.5','ing'], ['Kosher salt','0.5','ing']]);
select pg_temp.estimate(pg_temp.recipe('Green Beans', 'boil'), array[['Green beans','16','ing']]);
select pg_temp.estimate(pg_temp.recipe('Broccoli', 'boil'), array[['Broccoli crowns','16','ing']]);
select pg_temp.estimate(pg_temp.recipe('Broccoli Rabe', 'boil'), array[['Broccoli rabe (or crowns)','16','ing']]);
select pg_temp.estimate(pg_temp.recipe('Roasted Broccoli', 'roast'), array[['Broccoli crowns','16','ing'], ['Olive oil','0.5','ing'], ['Kosher salt','0.1','ing']]);
update public.kitchen_recipes set finished_oz = 10.8 where kitchen_id = pg_temp.k() and name = 'Roasted Broccoli' and finished_oz is null; -- roasting loses ~20% more than boiling
select pg_temp.estimate(pg_temp.recipe('Brussels Sprouts', 'roast'), array[['Brussels sprouts','16','ing']]);
-- 20–25 count ≈ 22.5/lb raw → 0.711 oz each × 0.80 cooked = 0.569 oz finished per shrimp.
select pg_temp.estimate(pg_temp.recipe('Shrimp', 'saute'), array[['Shrimp 20-25 ct','16','ing']]);
update public.kitchen_recipes set oz_per_piece = 0.569 where kitchen_id = pg_temp.k() and name = 'Shrimp' and oz_per_piece is null;
select pg_temp.estimate(pg_temp.recipe('Mixed Greens', 'no-cook'), array[['Mixed greens','16','ing']]);
select pg_temp.estimate(pg_temp.recipe('Shredded Carrots', 'no-cook'), array[['Shredded carrots','16','ing']]);
select pg_temp.estimate(pg_temp.recipe('Sliced Bell Peppers', 'no-cook'), array[['Bell peppers','16','ing']]);
select pg_temp.estimate(pg_temp.recipe('Chopped Cilantro', 'no-cook'), array[['Cilantro','16','ing']]);

-- Recipes the kitchen still has to give (created empty so plates can point at them).
select pg_temp.recipe('Meatloaf', 'bake');
select pg_temp.recipe(n) from unnest(array['Gravy', 'Chicken Teriyaki', 'Fried Rice', 'Thai Chicken', 'Peanut Sauce',
  'Ruben Casserole', 'Chicken Noodle Soup', 'German Potato Salad', 'Smoked Salmon', 'Cheesy Grits']) n;
update public.kitchen_recipes set method = 'smoke' where kitchen_id = pg_temp.k() and name = 'Smoked Salmon' and method is null;

-- ── Plates ──────────────────────────────────────────────────────────────────
select pg_temp.size(pg_temp.item('Home style Meatloaf with Mashed Potatoes, gravy and Green Beans'), 'regular', 1,
  array[['Meatloaf','4'],['Mashed Potatoes','4'],['Green Beans','4'],['Gravy','2']],
  array[['28 oz long plate','1','Meal']]);

select pg_temp.size(pg_temp.item('Chicken Teriyaki'), 'regular', 1,
  array[['Chicken Teriyaki','4'],['Fried Rice','4'],['Broccoli Rabe','4']],
  array[['28 oz long plate','1','Meal']]);

-- Served on greens; peanut sauce 2 oz cup (1.5 oz fill) single, 4 oz cup (3.5 oz fill) family.
select pg_temp.size(pg_temp.item('Thai Chicken Lettuce Bowl with Peanut Sauce'), 'regular', 1,
  array[['Thai Chicken','4'],['Mixed Greens','2'],['Shredded Carrots','1'],['Sliced Bell Peppers','1'],['Chopped Cilantro','0.1'],['Peanut Sauce','1.5']],
  array[['28 oz plate','1','Bowl'],['2 oz condiment cup','1','Peanut sauce']]);

select pg_temp.size(pg_temp.item('Ruben Casserole with potato salad'), 'regular', 1,
  array[['Ruben Casserole','8'],['Potato Salad','4']],
  array[['28 oz divided plate','1','Meal']]);

select pg_temp.size(pg_temp.item('Chicken Noodle Soup'), 'regular', 1, array[['Chicken Noodle Soup','16']], array[['16 oz deli','1','Soup']]);
select pg_temp.size(pg_temp.item('Chicken Noodle Soup'), '24 ounces', 1, array[['Chicken Noodle Soup','24']], array[['24 oz deli','1','Soup']]);
select pg_temp.size(pg_temp.item('Chicken Noodle Soup'), '32 ounces', 1, array[['Chicken Noodle Soup','32']], array[['32 oz deli','1','Soup']]);

-- Shrimp: 9 pieces, +3 on the 6 oz option, family weighed out.
select pg_temp.size(pg_temp.item('Shrimp & Grits with Brussels sprouts'), 'regular', 1,
  array[['Shrimp','9 pcs'],['Cheesy Grits','4'],['Brussels Sprouts','4']], array[['24 oz long plate','1','Meal']]);
select pg_temp.size(pg_temp.item('Shrimp & Grits with Brussels sprouts'), '6 oz', 1,
  array[['Shrimp','12 pcs'],['Cheesy Grits','4'],['Brussels Sprouts','4']], array[['24 oz long plate','1','Meal']]);
select pg_temp.size(pg_temp.item('Shrimp & Grits with Brussels sprouts'), 'family', 3,
  array[['Shrimp','16'],['Cheesy Grits','16'],['Brussels Sprouts','16']], array[['24 oz long plate','3','Meal']]);

select pg_temp.size(pg_temp.item('Smoked Salmon by the pound'), 'regular', 1,
  array[['Smoked Salmon','16'],['BBQ Sauce','3.5']], array[['24 oz long plate','1','Meat'],['4 oz styro cup','1','BBQ sauce']]);

-- Garden plate this week is "Garden Vegetables and sides - Menu A".
select pg_temp.title(pg_temp.item('Garden Vegetable and Sides', 'sidePlate', 4), 'Garden Vegetables and sides');
select pg_temp.side(n) from unnest(array['Brussels Sprouts', 'Green Beans', 'Mashed Potatoes', 'Cheesy Grits', 'German Potato Salad', 'Roasted Broccoli']) n;

-- Artisan Sweets: prep list only.
select pg_temp.size(pg_temp.item(n, 'prepOnly'), 'regular', 1, array[]::text[][], array[]::text[][])
from unnest(array['Sourdough - choose from our most popular flavors', 'Yummy COOKIES!!']) n;
