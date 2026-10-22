-- Beef Barley Soup (Instant Pot starting recipe, kitchen 2026-10-22). Re-runnable.
-- Line weights are computed here in SQL: amount × grams per unit (estimates) ÷ 28.3495 → oz,
-- then ÷ ingredient yield for measures taken after trimming (cups chopped) → as-purchased oz.
-- Beef stock is Better Than Bouillon (roasted beef): 1 tsp per 1 cup water, like Chicken Broth.
-- Left out: optional frozen peas, mushrooms. Beef uses the top of the 1.5–2 lb range.

select set_config('seed.kitchen', (select id::text from public.kitchens where name = 'TR Help'), false);
create or replace function pg_temp.k() returns uuid language sql stable as $$ select current_setting('seed.kitchen')::uuid $$;
create or replace function pg_temp.recipe(n text, m text default null) returns uuid language plpgsql as $$
declare r uuid;
begin
  select id into r from public.kitchen_recipes where kitchen_id = pg_temp.k() and lower(name) = lower(n) order by (v1_id is null) desc limit 1;
  if r is null then insert into public.kitchen_recipes (kitchen_id, name, method) values (pg_temp.k(), n, m) returning id into r; end if;
  return r;
end $$;
create or replace function pg_temp.ing(n text, y numeric default 1, cat text default null, stap boolean default false,
  unit text default null, unit_oz numeric default null) returns uuid language plpgsql as $$
declare r uuid;
begin
  select id into r from public.ingredients where kitchen_id = pg_temp.k() and lower(name) = lower(n);
  if r is null then insert into public.ingredients (kitchen_id, name, yield, yield_source, category, staple, purchase_unit, purchase_oz)
    values (pg_temp.k(), n, y, 'estimate', cat, stap, unit, unit_oz) returning id into r; end if;
  return r;
end $$;

-- New ingredients (yields are estimates). Chuck: trim loss only; its juices stay in the soup.
select pg_temp.ing('Beef chuck roast', 0.90, 'Meat & Seafood');
select pg_temp.ing('Pearl barley', 1, 'Canned & Dry');
select pg_temp.ing('Tomato paste', 1, 'Canned & Dry');
select pg_temp.ing('Balsamic vinegar', 1, 'Sauces & Condiments', true);
select pg_temp.ing('Dried rosemary', 1, 'Canned & Dry', true);
select pg_temp.ing('Better Than Bouillon, roasted beef', 1, 'Canned & Dry', true, 'tsp', 0.21);

-- ── Beef Broth = water + Better Than Bouillon (mixed in, no prep line) ───────
select pg_temp.recipe('Beef Broth', 'no-cook');
update public.kitchen_recipes set method = 'no-cook', on_prep_sheet = false,
  notes = 'Better Than Bouillon per package: 1 tsp per 1 cup water. Mixed into the dish, no prep line.'
where id = pg_temp.recipe('Beef Broth');
delete from public.recipe_lines where recipe_id = pg_temp.recipe('Beef Broth');
insert into public.recipe_lines (kitchen_id, recipe_id, position, amount, unit, raw_name, oz, ingredient_id, note)
select pg_temp.k(), pg_temp.recipe('Beef Broth'), b.pos, 1, b.unit, b.name, i.purchase_oz, i.id, 'kitchen ok'
from (values (1, 'cup', 'Water'), (2, 'tsp', 'Better Than Bouillon, roasted beef')) b(pos, unit, name)
join public.ingredients i on i.id = pg_temp.ing(b.name);

-- ── Beef Barley Soup ─────────────────────────────────────────────────────────
select pg_temp.recipe('Beef Barley Soup', 'simmer');
update public.kitchen_recipes set method = 'simmer', finished_oz = null, finished_oz_measured = false,
  notes = 'Starting recipe (Instant Pot). Optional: 1 cup frozen peas stirred in at the end; mushrooms with the celery and carrots. Hulled barley: add 5 min pressure time.',
  steps = E'1. SAUTÉ: heat olive oil. Brown the beef with salt and pepper on all sides. Set aside.\n2. Onion, celery, carrots: 3–4 min until starting to soften.\n3. Garlic, thyme, rosemary, tomato paste: 1 min. Add Worcestershire and balsamic; scrape up the brown bits.\n4. Cancel SAUTÉ. Add broth, water, bay leaf, barley and the beef.\n5. Pressure cook HIGH 20 min. Natural release 10 min, then quick release.\n6. Remove bay leaf.'
where id = pg_temp.recipe('Beef Barley Soup');

delete from public.recipe_lines where recipe_id = pg_temp.recipe('Beef Barley Soup');
insert into public.recipe_lines (kitchen_id, recipe_id, position, amount, unit, raw_name, note, ingredient_id, oz)
select pg_temp.k(), pg_temp.recipe('Beef Barley Soup'), v.pos, v.amount, v.unit, v.line, v.note, i.id,
  round(v.amount * v.g_per_unit / 28.3495 / case when v.trimmed then i.yield else 1 end, 2)
from (values
  -- pos, amount, unit, line, ingredient, grams per unit (estimate), measured after trimming?, note
  (1,  1::numeric,  'tbsp',   'olive oil',                    'Olive oil',             13.5::numeric, false, 'estimate'),
  (2,  2,           'lb',     'beef chuck roast, small cubes', 'Beef chuck roast',     453.592,       false, '1.5–2 lb'),
  (3,  1,           'tsp',    'kosher salt',                  'Kosher salt',           3,             false, 'estimate'),
  (4,  0.5,         'tsp',    'black pepper',                 'Black pepper',          2.3,           false, 'estimate'),
  (5,  1,           'cup',    'yellow onion, diced (1 onion)', 'Yellow onion',         160,           true,  'estimate'),
  (6,  1,           'cup',    'celery, sliced (2 stalks)',    'Celery',                101,           true,  'estimate'),
  (7,  1.5,         'cups',   'carrots, sliced (2–3)',        'Carrots',               122,           true,  'estimate'),
  (8,  3,           'cloves', 'garlic, minced (1 tbsp)',      'Garlic',                3,             true,  'estimate'),
  (9,  1,           'tsp',    'dried thyme',                  'Dried thyme',           1,             false, 'estimate'),
  (10, 1,           'tsp',    'dried rosemary',               'Dried rosemary',        1.2,           false, 'estimate'),
  (11, 1,           'tbsp',   'tomato paste',                 'Tomato paste',          16,            false, 'estimate'),
  (12, 1,           'tbsp',   'Worcestershire sauce',         'Worcestershire sauce',  17,            false, 'estimate'),
  (13, 1,           'tbsp',   'balsamic vinegar',             'Balsamic vinegar',      16,            false, 'estimate'),
  (15, 1,           'cup',    'water',                        'Water',                 236.588,       false, 'kitchen ok'),
  (16, 1,           '',       'bay leaf',                     'Bay leaves',            0.2,           false, 'estimate'),
  (17, 0.75,        'cup',    'pearl barley',                 'Pearl barley',          200,           false, 'estimate')
) v(pos, amount, unit, line, ingredient, g_per_unit, trimmed, note)
join public.ingredients i on i.id = pg_temp.ing(v.ingredient);

-- 4 cups beef stock → Beef Broth; weight = cups × one broth batch, so both cards agree.
insert into public.recipe_lines (kitchen_id, recipe_id, position, amount, unit, raw_name, note, sub_recipe_id, oz)
select pg_temp.k(), pg_temp.recipe('Beef Barley Soup'), 14, 4, 'cups', 'beef broth', 'kitchen ok', pg_temp.recipe('Beef Broth'),
  4 * (select sum(b.oz) from public.recipe_lines b where b.recipe_id = pg_temp.recipe('Beef Broth'));

-- Result, computed: line weights and the estimated batch weight the planner will use.
select l.position, l.amount, l.unit, l.raw_name, l.oz,
  round(l.oz * coalesce(i.yield, 1), 2) as finished_oz
from public.recipe_lines l left join public.ingredients i on i.id = l.ingredient_id
where l.recipe_id = pg_temp.recipe('Beef Barley Soup')
union all
select 99, null, '', 'BATCH (estimate)', round(sum(l.oz), 2), round(sum(l.oz * coalesce(i.yield, 1)), 2)
from public.recipe_lines l left join public.ingredients i on i.id = l.ingredient_id
where l.recipe_id = pg_temp.recipe('Beef Barley Soup')
order by 1;
