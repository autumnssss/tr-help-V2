-- Recipes for the 2026-10-12 drop, from the kitchen (2026-10-14). Volumes converted to
-- weight with standard densities; yields are estimates until a real batch is weighed.
-- Water, pan drippings and anything else not bought are left out of the lines; the
-- recipe's finished_oz carries their weight so batch scaling stays right.
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

create or replace function pg_temp.ingredient(n text, y numeric, unit text default null, unit_oz numeric default null) returns uuid language plpgsql as $$
declare r uuid;
begin
  select id into r from public.ingredients where kitchen_id = pg_temp.k() and lower(name) = lower(n);
  if r is null then
    insert into public.ingredients (kitchen_id, name, yield, yield_source, purchase_unit, purchase_oz)
    values (pg_temp.k(), n, y, 'estimate', unit, unit_oz) returning id into r;
  end if;
  return r;
end $$;

-- lines: [amount, unit, as written, oz, ingredient or sub-recipe name, 'ing' | 'sub']
create or replace function pg_temp.set_lines(recipe uuid, note text, lines text[][]) returns void language plpgsql as $$
declare i int;
begin
  delete from public.recipe_lines where recipe_id = recipe;
  for i in 1 .. array_length(lines, 1) loop
    insert into public.recipe_lines (kitchen_id, recipe_id, position, amount, unit, raw_name, oz, ingredient_id, sub_recipe_id, note)
    values (pg_temp.k(), recipe, i, nullif(lines[i][1], '')::numeric, lines[i][2], lines[i][3], lines[i][4]::numeric,
            case when lines[i][6] = 'ing' then (select id from public.ingredients where kitchen_id = pg_temp.k() and lower(name) = lower(lines[i][5])) end,
            case when lines[i][6] = 'sub' then pg_temp.recipe(lines[i][5]) end,
            set_lines.note);
  end loop;
end $$;

create or replace function pg_temp.finish(recipe uuid, oz numeric, notes text) returns void language sql as $$
  update public.kitchen_recipes set finished_oz = finish.oz, notes = finish.notes where id = recipe
$$;

-- ── Ingredients ─────────────────────────────────────────────────────────────
select pg_temp.ingredient(n, y) from (values
  ('Ground beef 80/20', 0.75), ('Eggs', 0.88), ('Worcestershire sauce', 1), ('Oat flour', 1), ('Italian seasoning', 1),
  ('Yellow onion', 0.90), ('Bell peppers', 0.82), ('All-purpose flour', 1), ('Vegetable oil', 1),
  ('Whole milk', 1), ('Quick grits', 1), ('Sharp cheddar', 1),
  ('Rye bread', 1), ('Garlic powder', 1), ('Corned beef (deli, cooked)', 1), ('Dill pickles', 1),
  ('Thousand Island dressing', 1), ('Swiss cheese slices', 1),
  ('Cornstarch', 1), ('Soy sauce', 1), ('Honey', 1),
  ('Rice vinegar', 1), ('Ground ginger', 1), ('Sesame oil', 1),
  ('Long-grain rice', 2.90), ('Carrots', 0.85), ('Frozen peas', 1),
  ('Green onions', 0.85), ('Fresh ginger', 0.80), ('Hoisin sauce', 1),
  ('Chicken breast, boneless skinless', 0.75), ('Peanut butter', 1), ('Brown sugar', 1), ('Salmon fillet', 0.75), ('Salmon rub', 1), ('Limes', 0.90)
) v(n, y);
select pg_temp.ingredient('Sauerkraut', 0.65, '16 oz jar', 16);          -- drained and rinsed
select pg_temp.ingredient('Water chestnuts', 0.60, '8 oz can', 8);       -- drained
-- Thai bowls are served on romaine, not mixed greens.
update public.ingredients set name = 'Romaine', yield = 0.75 where kitchen_id = pg_temp.k() and name = 'Mixed greens';
update public.kitchen_recipes set name = 'Romaine Lettuce' where kitchen_id = pg_temp.k() and name = 'Mixed Greens';
update public.recipe_lines set raw_name = 'Romaine' where raw_name = 'Mixed greens' and kitchen_id = pg_temp.k();

-- ── Meatloaf (V1 recipe, kitchen confirmed current) ────────────────────────
select pg_temp.set_lines(pg_temp.recipe('Meatloaf', 'bake'), 'V1', array[
  ['2',    'lbs',   'ground beef 80/20',     '32',   'Ground beef 80/20',    'ing'],
  ['2',    'large', 'eggs',                  '3.5',  'Eggs',                 'ing'],
  ['0.25', 'c',     'Worcestershire sauce',  '2.4',  'Worcestershire sauce', 'ing'],
  ['0.75', 'cup',   'oat flour',             '2.4',  'Oat flour',            'ing'],
  ['1',    'tbsp',  'Italian seasoning',     '0.1',  'Italian seasoning',    'ing'],
  ['1.25', 'tsp',   'salt',                  '0.26', 'Kosher salt',          'ing'],
  ['0.5',  'tsp',   'black pepper',          '0.04', 'Black pepper',         'ing'],
  ['1',    'cup',   'onion',                 '5.6',  'Yellow onion',         'ing'],
  ['0.5',  'cup',   'yellow bell pepper',    '2.6',  'Bell peppers',         'ing'],
  ['0.5',  'cup',   'red bell pepper',       '2.6',  'Bell peppers',         'ing']]);

-- ── Gravy: roux + meatloaf pan drippings (drippings and water not bought) ──
select pg_temp.set_lines(pg_temp.recipe('Gravy', 'saute'), 'estimate', array[
  ['0.25', 'cup', 'flour',      '1.1',  'All-purpose flour', 'ing'],
  ['0.25', 'cup', 'oil',        '1.75', 'Vegetable oil',     'ing'],
  ['0.25', 'tsp', 'salt',       '0.05', 'Kosher salt',       'ing'],
  ['0.25', 'tsp', 'pepper',     '0.02', 'Black pepper',      'ing']]);
select pg_temp.finish(pg_temp.recipe('Gravy'), 18, 'Roux of flour and oil, thinned with ~2 cups meatloaf pan drippings + water (not bought). Ratios are an estimate.');

-- ── Cheesy Grits (The Domestic Diva); 2 cups water not bought ──────────────
select pg_temp.set_lines(pg_temp.recipe('Cheesy Grits', 'boil'), 'starting recipe', array[
  ['2',    'tbsp', 'unsalted butter',       '1',    'Butter',          'ing'],
  ['1',    'cup',  'whole milk',            '8.6',  'Whole milk',      'ing'],
  ['0.25', 'tsp',  'salt',                  '0.05', 'Kosher salt',     'ing'],
  ['0.75', 'cup',  'quick cooking grits',   '4.1',  'Quick grits',     'ing'],
  ['6',    'oz',   'sharp cheddar cheese',  '6',    'Sharp cheddar',   'ing'],
  ['0.125','tsp',  'black pepper',          '0.01', 'Black pepper',    'ing']]);
select pg_temp.finish(pg_temp.recipe('Cheesy Grits'), 32, 'Plus 2 cups water. Starting recipe: The Domestic Diva Best Southern Cheese Grits.');

-- ── Reuben Casserole (This Is Not Diet Food) ────────────────────────────────
select pg_temp.set_lines(pg_temp.recipe('Ruben Casserole', 'bake'), 'starting recipe', array[
  ['6',    'cups',   'rye bread, 1-inch cubes',        '6.6',  'Rye bread',                  'ing'],
  ['0.25', 'cup',    'melted butter',                  '2',    'Butter',                     'ing'],
  ['0.5',  'tsp',    'garlic powder',                  '0.05', 'Garlic powder',              'ing'],
  ['1',    'lb',     'cooked corned beef, deli sliced','16',   'Corned beef (deli, cooked)', 'ing'],
  ['1',    '16-oz jar','sauerkraut, drained and rinsed','16',  'Sauerkraut',                 'ing'],
  ['0.5',  'cup',    'chopped dill pickles',           '2.6',  'Dill pickles',               'ing'],
  ['0.25', 'cup',    'chopped fresh parsley',          '0.25', 'Italian parsley',            'ing'],
  ['1',    'cup',    'Thousand Island dressing',       '8.5',  'Thousand Island dressing',   'ing'],
  ['6',    'slices', 'Swiss cheese',                   '6',    'Swiss cheese slices',        'ing']]);

-- ── Chicken Teriyaki (andianne); 1/4 cup water not bought ──────────────────
select pg_temp.set_lines(pg_temp.recipe('Chicken Teriyaki', 'saute'), 'starting recipe', array[
  ['1',    'tbsp', 'olive oil',                         '0.5',  'Olive oil',                         'ing'],
  ['1.5',  'lbs',  'boneless skinless chicken breast',  '24',   'Chicken breast, boneless skinless', 'ing'],
  ['1',    'tbsp', 'cornstarch',                        '0.28', 'Cornstarch',                        'ing'],
  ['0.33', 'cup',  'soy sauce',                         '2.9',  'Soy sauce',                         'ing'],
  ['3',    'tbsp', 'honey',                             '2.25', 'Honey',                             'ing'],
  ['3',    'cloves','garlic, minced',                   '0.32', 'Garlic',                            'ing'],
  ['1',    'tbsp', 'rice vinegar',                      '0.5',  'Rice vinegar',                      'ing'],
  ['1',    'tsp',  'ginger powder',                     '0.07', 'Ground ginger',                     'ing'],
  ['1',    'tsp',  'sesame oil',                        '0.16', 'Sesame oil',                        'ing']]);

-- ── Fried Rice, on cooked rice made ahead ───────────────────────────────────
select pg_temp.set_lines(pg_temp.recipe('Cooked Rice', 'boil'), 'estimate', array[
  ['1', 'lb', 'long-grain rice (dry)', '16', 'Long-grain rice', 'ing']]);
select pg_temp.set_lines(pg_temp.recipe('Fried Rice', 'saute'), 'starting recipe', array[
  ['4',   'cups',  'cold cooked long-grain rice', '22.3', 'Cooked Rice',     'sub'],
  ['2',   'tbsp',  'neutral oil',                 '0.95', 'Vegetable oil',   'ing'],
  ['2',   'large', 'eggs, beaten',                '3.5',  'Eggs',            'ing'],
  ['1',   'cup',   'diced yellow onion',          '5.6',  'Yellow onion',    'ing'],
  ['1',   'cup',   'diced carrot',                '4.5',  'Carrots',         'ing'],
  ['0.5', 'cup',   'frozen peas',                 '2.4',  'Frozen peas',     'ing'],
  ['4',   'tbsp',  'softened unsalted butter',    '2',    'Butter',          'ing'],
  ['2',   'cloves','garlic, grated',              '0.21', 'Garlic',          'ing'],
  ['2',   'tbsp',  'soy sauce',                   '1.1',  'Soy sauce',       'ing'],
  ['0.5', 'tsp',   'black pepper',                '0.04', 'Black pepper',    'ing']]);

-- ── Thai Chicken (P.F. Chang's lettuce wrap copycat, filling only) ─────────
select pg_temp.set_lines(pg_temp.recipe('Thai Chicken', 'saute'), 'starting recipe', array[
  ['1',   'lb',    'chicken breast, minced',     '16',   'Chicken breast, boneless skinless',  'ing'],
  ['1',   'tbsp',  'low-sodium soy (marinade)',  '0.55', 'Soy sauce',       'ing'],
  ['1',   'tbsp',  'rice vinegar (marinade)',    '0.5',  'Rice vinegar',    'ing'],
  ['1',   'tsp',   'sesame oil (marinade)',      '0.16', 'Sesame oil',      'ing'],
  ['1',   'tbsp',  'olive oil',                  '0.5',  'Olive oil',       'ing'],
  ['1',   '',      'red bell pepper, finely chopped','6', 'Bell peppers',    'ing'],
  ['2',   '',      'green onions, chopped',      '1',    'Green onions',    'ing'],
  ['2',   'tsp',   'fresh ginger, minced',       '0.2',  'Fresh ginger',    'ing'],
  ['1',   'cup',   'water chestnuts, chopped',   '8',    'Water chestnuts', 'ing'],
  ['5',   'tbsp',  'low-sodium soy (sauce)',     '2.75', 'Soy sauce',       'ing'],
  ['2',   'tbsp',  'rice vinegar (sauce)',       '1',    'Rice vinegar',    'ing'],
  ['2',   'tsp',   'sugar',                      '0.3',  'Sugar',           'ing'],
  ['2',   'tsp',   'sesame oil (sauce)',         '0.32', 'Sesame oil',      'ing'],
  ['2',   'tbsp',  'hoisin sauce',               '1.2',  'Hoisin sauce',    'ing'],
  ['1',   'tsp',   'cornstarch',                 '0.1',  'Cornstarch',      'ing']]);
update public.kitchen_recipes set notes = 'Starting recipe: Tastes Better From Scratch P.F. Chang''s lettuce wraps (filling). Top of the ingredient list was cut off in the screenshot; lettuce and sriracha left out (served on romaine).'
where id = pg_temp.recipe('Thai Chicken');

-- ── Peanut Sauce (estimate: kitchen gave ingredients, not ratios) ───────────
select pg_temp.set_lines(pg_temp.recipe('Peanut Sauce', 'no-cook'), 'kitchen ok', array[
  ['1',    'cup',  'peanut butter',  '9',   'Peanut butter', 'ing'],
  ['3',    'tbsp', 'brown sugar',    '1.3', 'Brown sugar',   'ing'],
  ['0.25', 'cup',  'soy sauce',      '2.2', 'Soy sauce',     'ing']]);
select pg_temp.finish(pg_temp.recipe('Peanut Sauce'), 16.5, 'Plus ~1/2 cup water to thin. Ratios approved by the kitchen 2026-10-15.');

-- ── Smoked Salmon: rub, ~4 hours in the smoker, finished in the oven ───────
select pg_temp.set_lines(pg_temp.recipe('Smoked Salmon', 'smoke'), 'estimate', array[
  ['1',   'lb', 'salmon fillet', '16',  'Salmon fillet', 'ing'],
  ['0.5', 'oz', 'spice rub',     '0.5', 'Salmon rub',    'ing']]);
update public.kitchen_recipes set notes = 'About 4 hours in the smoker, finished in the oven. Rub varies.' where id = pg_temp.recipe('Smoked Salmon');

-- ── Thai bowl: romaine instead of mixed greens, plus a lime slice ──────────
select pg_temp.set_lines(pg_temp.recipe('Lime Slices', 'no-cook'), 'estimate', array[['1', '', 'lime', '2.4', 'Limes', 'ing']]);
update public.kitchen_recipes set oz_per_piece = 0.27 where id = pg_temp.recipe('Lime Slices');  -- ~8 slices per lime
insert into public.size_portions (kitchen_id, size_id, recipe_id, pieces)
select pg_temp.k(), s.id, pg_temp.recipe('Lime Slices'), 1
from public.menu_sizes s join public.menu_items m on m.id = s.menu_item_id
where m.kitchen_id = pg_temp.k() and m.name = 'Thai Chicken Lettuce Bowl with Peanut Sauce'
  and not exists (select 1 from public.size_portions p where p.size_id = s.id and p.recipe_id = pg_temp.recipe('Lime Slices'));

-- ── Chicken Noodle Soup (Dinner Done Easy) ──────────────────────────────────
select pg_temp.ingredient('Celery', 0.89);
select pg_temp.ingredient('Chicken breast, boneless skinless', 0.75);
select pg_temp.ingredient('Dried thyme', 1);
select pg_temp.ingredient('Bay leaves', 1);
select pg_temp.ingredient('Egg noodles', 1);
select pg_temp.set_lines(pg_temp.recipe('Chicken Noodle Soup', 'boil'), 'starting recipe', array[
  ['2',  'tbsp',   'olive oil',                    '0.95', 'Olive oil',                         'ing'],
  ['1',  '',       'onion, chopped',               '5.3',  'Yellow onion',                      'ing'],
  ['2',  '',       'carrots, sliced',              '4.3',  'Carrots',                           'ing'],
  ['2',  'stalks', 'celery, sliced',               '2.8',  'Celery',                            'ing'],
  ['3',  'cloves', 'garlic, minced',               '0.32', 'Garlic',                            'ing'],
  ['8',  'cups',   'chicken broth',                '68',   'Chicken broth',                     'ing'],
  ['2',  'cups',   'cooked chicken, shredded (raw weight)', '13.2', 'Chicken breast, boneless skinless', 'ing'],
  ['1',  'tsp',    'dried thyme',                  '0.03', 'Dried thyme',                       'ing'],
  ['1',  '',       'bay leaf',                     '0.01', 'Bay leaves',                        'ing'],
  ['8',  'oz',     'egg noodles',                  '8',    'Egg noodles',                       'ing'],
  ['',   '',       'fresh parsley, garnish',       '0.1',  'Italian parsley',                   'ing']]);
select pg_temp.finish(pg_temp.recipe('Chicken Noodle Soup'), 90,
  'Starting recipe: Dinner Done Easy. ~10% simmer loss assumed. 2 cups cooked chicken ≈ 13 oz raw breast.');
