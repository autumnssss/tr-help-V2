-- Black Beans (kitchen recipe, 2026-10-22). Re-runnable; no deletes.
-- Choices: broth (recommended) = Chicken Broth (Better Than Bouillon), 6 cups to start, water added as needed;
-- olive oil uses the top of 1–2 tbsp. Batch = the recipe's stated yield, 6 cups cooked beans × 172 g per cup
-- (USDA, cooked black beans) — an estimate until a batch is weighed.
-- Line weights computed here in SQL: amount × grams per unit (estimates) ÷ 28.3495, ÷ yield for trimmed measures.

with k as (select id from public.kitchens where name = 'TR Help')
insert into public.ingredients (kitchen_id, name, yield, yield_source, category, staple)
select k.id, 'Black beans, dry', 1, 'estimate', 'Canned & Dry', false from k
where not exists (select 1 from public.ingredients i where i.kitchen_id = k.id and i.name = 'Black beans, dry');

with k as (select id from public.kitchens where name = 'TR Help')
insert into public.kitchen_recipes (kitchen_id, name, method, notes, steps, finished_oz, finished_oz_measured)
select k.id, 'Black Beans', 'simmer',
  'Batch: about 6 cups cooked beans (estimate). Mash a small scoop against the side of the pot at the end to thicken the liquid.',
  E'1. Sauté onion in olive oil 4–5 min. Add garlic, 30 sec.\n2. Add beans, broth and black pepper.\n3. Boil, then reduce to a gentle simmer.\n4. Cover partially and cook 1½–2 hours, stirring occasionally, until tender. Add water as needed.\n5. Stir in salt in the last 20–30 min. Adjust seasoning.\n6. Mash a small scoop of beans against the side of the pot to thicken.',
  6 * 172 / 28.3495, false
from k
where not exists (select 1 from public.kitchen_recipes r where r.kitchen_id = k.id and r.name = 'Black Beans');

with k as (select id from public.kitchens where name = 'TR Help')
insert into public.recipe_lines (kitchen_id, recipe_id, position, amount, unit, raw_name, note, ingredient_id, oz)
select k.id, r.id, v.pos, v.amount, v.unit, v.line, v.note, i.id,
  round(v.amount * v.g / 28.3495 / case when v.trimmed then i.yield else 1 end, 3)
from k, (values
  (1, 1::numeric, 'lb',     'dry black beans, rinsed and picked over', 'Black beans, dry', 453.592::numeric, false, ''),
  (2, 1,          '',       'onion, diced (1 medium)',                 'Yellow onion',     110,              true,  'estimate'),
  (3, 4,          'cloves', 'garlic, minced',                          'Garlic',           3,                true,  'estimate'),
  (4, 2,          'tbsp',   'olive oil (1–2 tbsp)',                    'Olive oil',        13.5,             false, 'estimate'),
  (5, 1,          'tsp',    'kosher salt, plus more to taste',         'Kosher salt',      3,                false, 'estimate'),
  (6, 0.5,        'tsp',    'black pepper',                            'Black pepper',     2.3,              false, 'estimate')
) v(pos, amount, unit, line, ingredient, g, trimmed, note)
join public.kitchen_recipes r on r.kitchen_id = (select id from k) and r.name = 'Black Beans'
join public.ingredients i on i.kitchen_id = (select id from k) and i.name = v.ingredient
where not exists (select 1 from public.recipe_lines l where l.recipe_id = r.id and l.position = v.pos);

-- 6 cups broth → Chicken Broth; weight = cups × one broth batch, so both cards agree.
with k as (select id from public.kitchens where name = 'TR Help'),
  beans as (select r.id from public.kitchen_recipes r, k where r.kitchen_id = k.id and r.name = 'Black Beans'),
  broth as (select r.id from public.kitchen_recipes r, k where r.kitchen_id = k.id and r.name = 'Chicken Broth')
insert into public.recipe_lines (kitchen_id, recipe_id, position, amount, unit, raw_name, note, sub_recipe_id, oz)
select (select id from k), beans.id, 7, 6, 'cups', 'chicken broth (6–8 cups; add water as needed)', 'kitchen ok', broth.id,
  6 * (select sum(b.oz) from public.recipe_lines b where b.recipe_id = broth.id)
from beans, broth
where not exists (select 1 from public.recipe_lines l where l.recipe_id = beans.id and l.position = 7);
