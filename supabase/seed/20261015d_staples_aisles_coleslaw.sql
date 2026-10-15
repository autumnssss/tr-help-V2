-- Kitchen 2026-10-15 (3):
--   * Staples always on hand stay off the shopping list (pantry list instead).
--   * Shopping list grouped by store section.
--   * Counted items (eggs, cracker packs, limes, cream cheese blocks) show a count;
--     everything else shows oz/lb only, no container rounding.
--   * Chicken broth is always Better Than Bouillon + water per package directions.
--   * Coleslaw stand-in recipe (Alpha Foodie, serves 16).
-- Re-runnable.

select set_config('seed.kitchen', (select id::text from public.kitchens where name = 'TR Help'), false);
create or replace function pg_temp.k() returns uuid language sql stable as $$ select current_setting('seed.kitchen')::uuid $$;

create or replace function pg_temp.ingredient(n text, y numeric) returns uuid language plpgsql as $$
declare r uuid;
begin
  select id into r from public.ingredients where kitchen_id = pg_temp.k() and lower(name) = lower(n);
  if r is null then insert into public.ingredients (kitchen_id, name, yield, yield_source) values (pg_temp.k(), n, y, 'estimate') returning id into r; end if;
  return r;
end $$;

create or replace function pg_temp.recipe(n text, m text default null) returns uuid language plpgsql as $$
declare r uuid;
begin
  select id into r from public.kitchen_recipes where kitchen_id = pg_temp.k() and lower(name) = lower(n) order by (v1_id is null) desc limit 1;
  if r is null then insert into public.kitchen_recipes (kitchen_id, name, method) values (pg_temp.k(), n, m) returning id into r; end if;
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

-- ── Better Than Bouillon ────────────────────────────────────────────────────
update public.ingredients set name = 'Better Than Bouillon chicken base (+ water)'
where kitchen_id = pg_temp.k() and name = 'Chicken broth';

-- ── Coleslaw (optional lemon juice left out) ───────────────────────────────
select pg_temp.ingredient('Green cabbage', 0.80);
select pg_temp.ingredient('Red cabbage', 0.80);
select pg_temp.ingredient('Apple cider vinegar', 1);
select pg_temp.ingredient('Celery seed', 1);
select pg_temp.set_lines(pg_temp.recipe('Coleslaw', 'no-cook'), 'starting recipe', array[
  ['14',   'oz',     'green cabbage, shredded',  '14',   'Green cabbage',       'ing'],
  ['3',    'oz',     'carrots, shredded',        '3',    'Carrots',             'ing'],
  ['1',    'handful','red cabbage, shredded',    '1',    'Red cabbage',         'ing'],
  ['0.5',  'cup',    'mayonnaise',               '4',    'Mayonnaise',          'ing'],
  ['1.5',  'tbsp',   'apple cider vinegar',      '0.75', 'Apple cider vinegar', 'ing'],
  ['0.5',  'tsp',    'celery seeds',             '0.04', 'Celery seed',         'ing'],
  ['0.25', 'tsp',    'sea salt',                 '0.05', 'Kosher salt',         'ing'],
  ['0.25', 'tsp',    'black pepper',             '0.02', 'Black pepper',        'ing'],
  ['2',    'tsp',    'sugar',                    '0.3',  'Sugar',               'ing']]);
update public.kitchen_recipes set notes = 'Stand-in: Alpha Foodie homemade coleslaw (serves 16). Optional lemon juice left out.'
where id = pg_temp.recipe('Coleslaw');
insert into public.side_links (kitchen_id, side_name, recipe_id) values (pg_temp.k(), 'Coleslaw', pg_temp.recipe('Coleslaw'))
on conflict (kitchen_id, side_name) do update set recipe_id = excluded.recipe_id;

-- ── Counted vs weighed ──────────────────────────────────────────────────────
update public.ingredients set purchase_unit = null, purchase_oz = null
where kitchen_id = pg_temp.k() and name in ('Shrimp 20-25 ct', 'Sauerkraut', 'Water chestnuts', 'Head Country BBQ sauce, Original');
update public.ingredients set purchase_unit = v.unit, purchase_oz = v.oz
from (values ('Eggs', 'eggs', 1.75), ('Limes', 'limes', 2.4), ('Oyster crackers, individual packs', 'packs', 0.5),
             ('Cream cheese, 8 oz block', 'blocks', 8)) v(n, unit, oz)
where kitchen_id = pg_temp.k() and name = v.n;

-- ── Staples (always on hand) ────────────────────────────────────────────────
update public.ingredients set staple = (name in (
  'Kosher salt', 'Black pepper', 'Butter', 'All-purpose flour', 'Cornstarch', 'Vegetable oil', 'Olive oil',
  'Sugar', 'Brown sugar', 'Garlic powder', 'Italian seasoning', 'Dried thyme', 'Bay leaves', 'Ground ginger',
  'Celery seed', 'White vinegar', 'Rice vinegar', 'Apple cider vinegar', 'Soy sauce', 'Worcestershire sauce',
  'Dijon mustard', 'Yellow mustard', 'Honey', 'Sesame oil', 'Head Country BBQ sauce, Original',
  'Better Than Bouillon chicken base (+ water)', 'BBQ rub', 'Salmon rub'))
where kitchen_id = pg_temp.k();

-- ── Store sections ──────────────────────────────────────────────────────────
update public.ingredients i set category = v.c
from (values
  ('Produce', array['Bell peppers','Broccoli crowns','Broccoli rabe (or crowns)','Brussels sprouts','Carrots','Celery','Cilantro',
    'Fresh ginger','Garlic','Green beans','Green onions','Italian parsley','Limes','Red onion','Red potatoes','Romaine','Russet potatoes',
    'Shredded carrots','Yellow onion','Green cabbage','Red cabbage']),
  ('Meat & Seafood', array['Bacon','Brisket (packer)','Chicken breast, boneless skinless','Ground beef 80/20','Pork butt','Salmon fillet','Shrimp 20-25 ct']),
  ('Deli', array['Corned beef (deli, cooked)','Swiss cheese slices']),
  ('Dairy & Eggs', array['Butter','Cream cheese, 8 oz block','Eggs','Heavy cream','Sharp cheddar','Whole milk']),
  ('Bakery', array['Rye bread']),
  ('Frozen', array['Frozen peas']),
  ('Canned & Dry', array['All-purpose flour','Bay leaves','Better Than Bouillon chicken base (+ water)','Brown sugar','Celery seed','Cornstarch',
    'Dried thyme','Egg noodles','Garlic powder','Ground ginger','Italian seasoning','Kosher salt','Black pepper','Long-grain rice','Oat flour',
    'Oyster crackers, individual packs','Peanut butter','Quick grits','Sugar','Water chestnuts','BBQ rub','Salmon rub']),
  ('Sauces & Condiments', array['Apple cider vinegar','Dijon mustard','Dill pickle spears','Dill pickles','Head Country BBQ sauce, Original',
    'Hoisin sauce','Honey','Mayonnaise','Olive oil','Rice vinegar','Sauerkraut','Sesame oil','Soy sauce','Thousand Island dressing',
    'Vegetable oil','White vinegar','Worcestershire sauce','Yellow mustard'])
) v(c, names)
where i.kitchen_id = pg_temp.k() and i.name = any(v.names);
