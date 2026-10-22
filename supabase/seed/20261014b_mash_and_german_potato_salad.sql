-- Kitchen corrections 2026-10-14:
--   * Mashed Potatoes are creamier: per 5 lb potatoes, 4 oz butter and 4–6 oz cream (5 used).
--   * The Reuben's potato salad is German Potato Salad. Starting recipe: Salt & Lavender,
--     per 2 lb red potatoes; the kitchen notes changes when making it.
-- Re-runnable.

select set_config('seed.kitchen', (select id::text from public.kitchens where name = 'TR Help'), false);

create or replace function pg_temp.k() returns uuid language sql stable as $$ select current_setting('seed.kitchen')::uuid $$;

create or replace function pg_temp.recipe(n text) returns uuid language sql stable as $$
  select id from public.kitchen_recipes where kitchen_id = pg_temp.k() and lower(name) = lower(n) order by (v1_id is null) desc limit 1
$$;

create or replace function pg_temp.ingredient(n text, y numeric) returns uuid language plpgsql as $$
declare r uuid;
begin
  select id into r from public.ingredients where kitchen_id = pg_temp.k() and lower(name) = lower(n);
  if r is null then
    insert into public.ingredients (kitchen_id, name, yield, yield_source) values (pg_temp.k(), n, y, 'estimate') returning id into r;
  end if;
  return r;
end $$;

-- lines: [amount, unit, name as written, oz, ingredient or sub-recipe name, 'ing' | 'sub']
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

-- Mashed Potatoes: per 5 lb boiled potatoes.
select pg_temp.set_lines(pg_temp.recipe('Mashed Potatoes'), 'estimate', array[
  ['5',    'lb',   'boiled potatoes', '80',   'Boiled Russet Potatoes', 'sub'],
  ['4',    'oz',   'butter',          '4',    'Butter',          'ing'],
  ['5',    'oz',   'heavy cream',     '5',    'Heavy cream',     'ing'],
  ['1.5',  'tsp',  'kosher salt',     '0.25', 'Kosher salt',     'ing'],
  ['0.5',  'tsp',  'black pepper',    '0.05', 'Black pepper',    'ing']]);

-- German Potato Salad (boil station: red potatoes boiled skin-on).
select pg_temp.ingredient('Red potatoes', 0.97);
select pg_temp.ingredient('Chicken broth', 1);
select pg_temp.ingredient('White vinegar', 1);
select pg_temp.ingredient('Sugar', 1);
select pg_temp.ingredient('Dijon mustard', 1);
select pg_temp.ingredient('Bacon', 0.30);        -- cooked crisp
select pg_temp.ingredient('Red onion', 0.80);    -- peeled, cooked in bacon fat
select pg_temp.ingredient('Garlic', 0.87);
select pg_temp.ingredient('Italian parsley', 0.70);
select pg_temp.ingredient('Kosher salt', 1);

update public.kitchen_recipes set method = 'boil', notes = 'Starting recipe: Salt & Lavender German Potato Salad. Kitchen to note changes.'
where id = pg_temp.recipe('German Potato Salad');

select pg_temp.set_lines(pg_temp.recipe('German Potato Salad'), 'starting recipe', array[
  ['2',    'lb',     'red potatoes',             '32',   'Red potatoes',    'ing'],
  ['0.25', 'cup',    'chicken or vegetable broth','2',   'Chicken broth',   'ing'],
  ['3',    'tbsp',   'white or cider vinegar',   '1.5',  'White vinegar',   'ing'],
  ['0.5',  'tbsp',   'white sugar',              '0.22', 'Sugar',           'ing'],
  ['1',    'tsp',    'Dijon or German mustard',  '0.18', 'Dijon mustard',   'ing'],
  ['12',   'oz',     'bacon',                    '12',   'Bacon',           'ing'],
  ['1',    'medium', 'red onion, chopped',       '5.3',  'Red onion',       'ing'],
  ['3',    'cloves', 'garlic, minced',           '0.32', 'Garlic',          'ing'],
  ['2.5',  'tbsp',   'chopped Italian parsley',  '0.13', 'Italian parsley', 'ing'],
  ['0.5',  'tsp',    'salt, to taste',           '0.1',  'Kosher salt',     'ing']]);

-- The Reuben comes with German Potato Salad.
update public.size_portions set recipe_id = pg_temp.recipe('German Potato Salad')
where recipe_id = pg_temp.recipe('Potato Salad')
  and size_id in (select s.id from public.menu_sizes s join public.menu_items m on m.id = s.menu_item_id
                  where m.kitchen_id = pg_temp.k() and m.name = 'Ruben Casserole with potato salad');
