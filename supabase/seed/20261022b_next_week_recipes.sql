-- Next week's recipes from the kitchen's recipe sheet (2026-10-22). Re-runnable.
-- Kitchen rules: where a recipe already exists (Beef Barley Stew, Butter Chicken, Meatballs - Italian,
-- Cauliflower & Peas, Cooked Rice = long grain white, Broccoli, Green Beans, Brussels Sprouts) the existing
-- one stays and the sheet's version is ignored. Rice, orzo and pasta cook per package (water and salt).
-- Prices and allergens are not kept.
-- Every weight is computed here in SQL: amount × mult × grams per unit (estimates) ÷ 28.3495 → oz.
-- Cooked yields come from the sheet's per-plate numbers (e.g. 1.4 oz dry → 4 oz cooked) and are estimates.

-- ── Ingredients (new ones only; yields computed from the sheet's raw → cooked weights) ──
with k as (select id from public.kitchens where name = 'TR Help')
insert into public.ingredients (kitchen_id, name, yield, yield_source, category, staple, purchase_unit, purchase_oz)
select k.id, v.name, v.y, 'estimate', v.cat, v.stap, v.unit, v.unit_oz
from k, (values
  ('Basmati rice',                     4 / 1.4::numeric,   'Canned & Dry',        false, null::text, null::numeric),
  ('Orzo',                             4 / 2.0,            'Canned & Dry',        false, null, null),
  ('Spaghetti',                        3.5 / 1.75,         'Canned & Dry',        false, null, null),
  ('Elbow macaroni',                   1,                  'Canned & Dry',        false, null, null),
  ('Pork tenderloin',                  0.75,               'Meat & Seafood',      false, null, null),
  ('Bologna, whole chub',              4 / 5.0,            'Deli',                false, null, null),
  ('Custom rub',                       1,                  'Canned & Dry',        false, null, null),
  ('Asparagus',                        4 / 7.0,            'Produce',             false, null, null),
  ('Sweet potatoes',                   0.80 * 0.75,        'Produce',             false, null, null),  -- peel ~20%, roast ~25% (standard estimate)
  ('Fresh chives',                     1,                  'Produce',             false, null, null),
  ('Fresh dill',                       1,                  'Produce',             false, null, null),
  ('Fresh thyme',                      1,                  'Produce',             false, null, null),
  ('Lemon juice',                      1,                  'Produce',             false, null, null),
  ('Paprika',                          1,                  'Canned & Dry',        true,  null, null),
  ('Onion powder',                     1,                  'Canned & Dry',        true,  null, null),
  ('Crushed tomatoes (28 oz can)',     1,                  'Canned & Dry',        false, 'cans', 28),
  ('Tone''s Italian Spaghetti Seasoning', 1,               'Canned & Dry',        false, null, null),
  ('Ranch dressing',                   1,                  'Sauces & Condiments', false, null, null)
) v(name, y, cat, stap, unit, unit_oz)
where not exists (select 1 from public.ingredients i where i.kitchen_id = k.id and lower(i.name) = lower(v.name));

-- ── Kitchen corrections to existing items ──
-- Brussels sprouts lose 40–45% roasted (kitchen); the larger loss is used so the order isn't short.
update public.ingredients i set yield = 1 - 0.45, yield_source = 'kitchen'
from public.kitchens k where k.id = i.kitchen_id and k.name = 'TR Help' and i.name = 'Brussels sprouts';
update public.kitchen_recipes r set notes = 'Boil in salted water: salt it until it tastes like the ocean.'
from public.kitchens k where k.id = r.kitchen_id and k.name = 'TR Help' and r.name in ('Broccoli', 'Green Beans') and r.notes = '';

-- ── Recipes (new ones only) ──
with k as (select id from public.kitchens where name = 'TR Help')
insert into public.kitchen_recipes (kitchen_id, name, method, notes, steps)
select k.id, v.name, v.m, v.notes, v.steps from k, (values
  ('Basmati Rice', 'boil', 'Plate: 4 oz cooked.',
   E'1. Rinse until the water runs mostly clear.\n2. Cook per package directions, including water and salt. Cook fully.\n3. Fluff and cool spread on a sheet pan before packing.'),
  ('Orzo', 'boil', 'Plate: 4 oz cooked.',
   E'1. Cook per package directions, including water and salt; pull 1 minute early.\n2. Toss with a little oil or butter and cool spread on a sheet pan (clumped orzo won''t separate).'),
  ('Spaghetti', 'boil', 'Plate: 3.5 oz cooked.',
   E'1. Cook per package directions, including water and salt.\n2. Toss with a little oil and cool spread out before packing.'),
  ('Spaghetti Sauce (Tone''s)', 'simmer', 'Plate: 2.5 oz sauce. Meatballs are not cooked in the sauce.',
   E'1. Combine tomatoes, sauce and seasoning. Simmer 30–40 min, stirring often (scorches easily).\n2. Taste before adding salt or sugar (the blend has both).\n3. Re-taste after a day in the fridge; add the last bit of seasoning then if it fades.'),
  ('Baked Pork Tenderloin', 'bake', 'Plate: 4 oz cooked. Microwave reheat.',
   E'1. Trim silver skin. Pat dry. Rub on all sides and drizzle with oil.\n2. Bake on sheet pans, spaced apart, at 400°F; pull at exactly 145°F internal.\n3. Rest 5 min, slice about ½ inch, spoon pan juices over.\n4. Cool spread out before packing.'),
  ('Roasted Sweet Potatoes', 'roast', 'Plate: 4 oz cooked. Oil, salt and pepper to coat (amounts not set).',
   E'1. Peel and cut into ¾ inch cubes. Toss in oil, salt and pepper.\n2. Roast single layer at 425°F, 25–30 min, until just fork-tender with browned edges.\n3. Cool spread out before packing.'),
  ('Herb Cheese Spread', 'no-cook', 'Plate: 1 oz, spread on salmon right out of the oven.',
   E'1. Beat softened cream cheese and butter until smooth.\n2. Add seasonings; fold the fresh herbs in last.\n3. Chill at least 1 hour.'),
  ('Baked Salmon', 'bake', 'Plate: 4 oz cooked (6 oz raw portion) + 1 oz Herb Cheese Spread.',
   E'1. Rub salmon with oil, salt and pepper.\n2. Bake at 400°F to 145°F internal. Do not go past 145°F.\n3. Spread herb cheese on top right out of the oven.'),
  ('Grilled Salmon', 'grill', 'Plate: 4 oz cooked (5.5 oz raw skinless portion; 7 oz if buying whole sides).',
   E'1. Rub with oil, salt and pepper.\n2. Grill on clean oiled grates, medium-high, about 4–5 min per side, to 145°F internal.'),
  ('Roasted Red Potatoes', 'roast', 'Plate: 4 oz cooked.',
   E'1. Cut ¾ inch cubes, toss in oil, salt and pepper.\n2. Roast at 425°F, 25–30 min.\n3. Toss with lemon juice right out of the oven. Cool spread out before packing.'),
  ('Roasted Asparagus', 'roast', 'Plate: 4 oz cooked.',
   E'1. Snap off woody ends. Toss in oil, salt and pepper.\n2. Roast at 425°F, 8–12 min. Pull while bright green.\n3. Cool spread out before packing.'),
  ('House Salad', 'no-cook', 'Plate: 2 oz. Ranch in its own cup: 1.5 oz single (2 oz cup), 4 oz family.',
   E'1. Dry romaine fully before packing.\n2. Pack ranch in its own cup.'),
  ('Ranch Dressing', 'no-cook', 'Lidded condiment cups: 1.5 oz single (2 oz cup), 4 oz family.', ''),
  ('Mac and Cheese', 'simmer', 'Plate: 4 oz. Batch weight is an estimate; weigh the first full batch.',
   E'1. Cook macaroni per package directions, 2 min short of al dente; cool spread on a sheet pan.\n2. Melt butter, whisk in flour 1 min, gradually whisk in milk until thickened.\n3. Off the heat, below a simmer, stir in cream cheese and cheeses in handfuls until melted. Season (taste first; cheeses are salty).\n4. Combine with macaroni. Keep the sauce slightly loose. No bake, no breadcrumb topping.\n5. Cool and pack.'),
  ('Smoked BBQ Bologna', 'smoke', 'Plate: 4 oz cooked, sliced. BBQ sauce on the side: 1.5 oz single, 4 oz family.',
   E'1. Rub the cut face and sides.\n2. Smoke. Serve sliced with BBQ sauce on the side.')
) v(name, m, notes, steps)
where not exists (select 1 from public.kitchen_recipes r where r.kitchen_id = k.id and lower(r.name) = lower(v.name));

-- ── Recipe lines (replaced on every run, for these recipes only) ──
delete from public.recipe_lines l using public.kitchen_recipes r, public.kitchens k
where l.recipe_id = r.id and r.kitchen_id = k.id and k.name = 'TR Help' and r.name in (
  'Basmati Rice', 'Orzo', 'Spaghetti', 'Spaghetti Sauce (Tone''s)', 'Baked Pork Tenderloin', 'Roasted Sweet Potatoes',
  'Herb Cheese Spread', 'Baked Salmon', 'Grilled Salmon', 'Roasted Red Potatoes', 'Roasted Asparagus', 'House Salad',
  'Ranch Dressing', 'Mac and Cheese', 'Smoked BBQ Bologna');

with k as (select id from public.kitchens where name = 'TR Help')
insert into public.recipe_lines (kitchen_id, recipe_id, position, amount, unit, raw_name, note, ingredient_id, oz)
select k.id, r.id, v.pos, round(v.amount * v.mult, 3), v.unit, v.line, v.note, i.id,
  round(v.amount * v.mult * v.g / 28.3495, 3)
from k, (values
  -- recipe, pos, amount, mult (batch scale), unit, line, ingredient, grams per unit (estimate), note
  ('Basmati Rice', 1, 1::numeric, 1::numeric, 'lb', 'basmati rice, dry', 'Basmati rice', 453.592::numeric, '1.4 oz dry → 4 oz cooked, estimate'),
  ('Orzo', 1, 1, 1, 'lb', 'orzo, dry', 'Orzo', 453.592, '2 oz dry → 4 oz cooked, estimate'),
  ('Spaghetti', 1, 1, 1, 'lb', 'spaghetti, dry', 'Spaghetti', 453.592, '1.75 oz dry → 3.5 oz cooked, estimate'),
  ('Spaghetti Sauce (Tone''s)', 1, 1, 1, 'can', 'crushed tomatoes (28 oz)', 'Crushed tomatoes (28 oz can)', 28 * 28.3495, ''),
  ('Spaghetti Sauce (Tone''s)', 2, 28, 1, 'oz', 'tomato sauce', 'Tomato sauce, canned', 28.3495, ''),
  ('Spaghetti Sauce (Tone''s)', 3, 8, 1, 'tbsp', 'Tone''s Italian Spaghetti Seasoning (4 tbsp per 28 oz can)', 'Tone''s Italian Spaghetti Seasoning', 5, 'estimate'),
  ('Baked Pork Tenderloin', 1, 2, 1, 'lb', 'pork tenderloin, silver skin trimmed', 'Pork tenderloin', 453.592, '5.3 oz raw → 4 oz cooked, estimate'),
  ('Baked Pork Tenderloin', 2, 1, 1, 'tbsp', 'brown sugar', 'Brown sugar', 13.8, 'estimate'),
  ('Baked Pork Tenderloin', 3, 1, 1, 'tsp', 'paprika', 'Paprika', 2.3, 'estimate'),
  ('Baked Pork Tenderloin', 4, 1, 1, 'tsp', 'garlic powder', 'Garlic powder', 3.1, 'estimate'),
  ('Baked Pork Tenderloin', 5, 1, 1, 'tsp', 'Italian seasoning', 'Italian seasoning', 1, 'estimate'),
  ('Baked Pork Tenderloin', 6, 0.75, 1, 'tsp', 'kosher salt', 'Kosher salt', 3, 'estimate'),
  ('Baked Pork Tenderloin', 7, 0.25, 1, 'tsp', 'black pepper', 'Black pepper', 2.3, 'estimate'),
  ('Baked Pork Tenderloin', 8, 2, 1, 'tbsp', 'olive oil', 'Olive oil', 13.5, 'estimate'),
  ('Roasted Sweet Potatoes', 1, 1, 1, 'lb', 'sweet potatoes', 'Sweet potatoes', 453.592, 'standard shrink, estimate'),
  ('Herb Cheese Spread', 1, 8, 1, 'oz', 'cream cheese, fully softened', 'Cream cheese, 8 oz block', 28.3495, ''),
  ('Herb Cheese Spread', 2, 4, 1, 'tbsp', 'unsalted butter, softened', 'Butter', 14.2, 'estimate'),
  ('Herb Cheese Spread', 3, 2, 1, 'tbsp', 'fresh chives, chopped', 'Fresh chives', 3, 'estimate'),
  ('Herb Cheese Spread', 4, 2, 1, 'tbsp', 'fresh parsley, chopped', 'Italian parsley', 3.8, 'estimate'),
  ('Herb Cheese Spread', 5, 0.5, 1, 'tsp', 'fresh dill, chopped', 'Fresh dill', 0.2, 'estimate'),
  ('Herb Cheese Spread', 6, 0.5, 1, 'tsp', 'fresh thyme, chopped', 'Fresh thyme', 0.8, 'estimate'),
  ('Herb Cheese Spread', 7, 0.5, 1, 'tsp', 'garlic powder', 'Garlic powder', 3.1, 'estimate'),
  ('Herb Cheese Spread', 8, 0.25, 1, 'tsp', 'onion powder', 'Onion powder', 2.4, 'estimate'),
  ('Herb Cheese Spread', 9, 0.25, 1, 'tsp', 'black pepper', 'Black pepper', 2.3, 'estimate'),
  ('Herb Cheese Spread', 10, 1, 1, 'pinch', 'kosher salt', 'Kosher salt', 0.36, 'estimate'),
  ('Baked Salmon', 1, 1, 1, 'lb', 'salmon fillet, skinless', 'Salmon fillet', 453.592, '6 oz raw → 4 oz cooked, estimate'),
  ('Baked Salmon', 2, 2, 1, 'tsp', 'oil', 'Olive oil', 4.5, 'estimate'),
  ('Baked Salmon', 3, 1, 1, 'tsp', 'kosher salt', 'Kosher salt', 3, 'estimate'),
  ('Baked Salmon', 4, 0.25, 1, 'tsp', 'black pepper', 'Black pepper', 2.3, 'estimate'),
  ('Grilled Salmon', 1, 1, 1, 'lb', 'salmon, skinless portions', 'Salmon fillet', 453.592, '5.5 oz raw → 4 oz cooked, estimate'),
  ('Grilled Salmon', 2, 2, 1, 'tsp', 'oil', 'Olive oil', 4.5, 'estimate'),
  ('Grilled Salmon', 3, 1, 1, 'tsp', 'kosher salt', 'Kosher salt', 3, 'estimate'),
  ('Grilled Salmon', 4, 0.25, 1, 'tsp', 'black pepper', 'Black pepper', 2.3, 'estimate'),
  ('Roasted Red Potatoes', 1, 1, 1, 'lb', 'red potatoes, scrubbed, skins on', 'Red potatoes', 453.592, '5.25 oz raw → 4 oz cooked, estimate'),
  ('Roasted Red Potatoes', 2, 1, 1, 'tbsp', 'oil', 'Olive oil', 13.5, 'estimate'),
  ('Roasted Red Potatoes', 3, 1, 1, 'tsp', 'kosher salt', 'Kosher salt', 3, 'estimate'),
  ('Roasted Red Potatoes', 4, 0.25, 1, 'tsp', 'black pepper', 'Black pepper', 2.3, 'estimate'),
  ('Roasted Red Potatoes', 5, 1, 1, 'tbsp', 'lemon juice', 'Lemon juice', 15.2, 'estimate'),
  ('Roasted Asparagus', 1, 1, 1, 'lb', 'asparagus', 'Asparagus', 453.592, '7 oz raw → 4 oz cooked, estimate'),
  ('Roasted Asparagus', 2, 1, 1, 'tbsp', 'oil', 'Olive oil', 13.5, 'estimate'),
  ('Roasted Asparagus', 3, 0.75, 1, 'tsp', 'kosher salt', 'Kosher salt', 3, 'estimate'),
  ('Roasted Asparagus', 4, 0.25, 1, 'tsp', 'black pepper', 'Black pepper', 2.3, 'estimate'),
  ('House Salad', 1, 2.2, 1, 'oz', 'romaine', 'Romaine', 28.3495, '1.6 oz on the plate'),
  ('House Salad', 2, 0.25, 1, 'oz', 'carrots, grated', 'Shredded carrots', 28.3495, '0.2 oz on the plate'),
  ('House Salad', 3, 0.25, 1, 'oz', 'red cabbage', 'Red cabbage', 28.3495, '0.2 oz on the plate'),
  ('Ranch Dressing', 1, 1, 1, 'oz', 'ranch dressing', 'Ranch dressing', 28.3495, ''),
  -- Mac and Cheese: the sheet gives per-plate amounts and a ~100 oz batch (4 oz plates), so mult = 100 ÷ 4 plates.
  ('Mac and Cheese', 1, 0.65, 100 / 4.0, 'oz', 'elbow macaroni, dry', 'Elbow macaroni', 28.3495, ''),
  ('Mac and Cheese', 2, 0.95, 100 / 4.0, 'oz', 'sharp cheddar, block-grated', 'Sharp cheddar', 28.3495, ''),
  ('Mac and Cheese', 3, 0.15, 100 / 4.0, 'oz', 'parmesan, grated', 'Parmesan, grated', 28.3495, ''),
  ('Mac and Cheese', 4, 0.15, 100 / 4.0, 'oz', 'cream cheese', 'Cream cheese, 8 oz block', 28.3495, ''),
  ('Mac and Cheese', 5, 1.4, 100 / 4.0, 'oz', 'whole milk', 'Whole milk', 28.3495, ''),
  ('Mac and Cheese', 6, 0.15, 100 / 4.0, 'oz', 'butter', 'Butter', 28.3495, ''),
  ('Mac and Cheese', 7, 0.1, 100 / 4.0, 'oz', 'all-purpose flour', 'All-purpose flour', 28.3495, ''),
  ('Mac and Cheese', 8, 1, 1, 'tsp', 'kosher salt', 'Kosher salt', 3, 'estimate'),
  ('Mac and Cheese', 9, 0.5, 1, 'tsp', 'black pepper', 'Black pepper', 2.3, 'estimate'),
  ('Mac and Cheese', 10, 1, 1, 'tsp', 'garlic powder', 'Garlic powder', 3.1, 'estimate'),
  ('Mac and Cheese', 11, 1, 1, 'tsp', 'onion powder', 'Onion powder', 2.4, 'estimate'),
  ('Smoked BBQ Bologna', 1, 1, 1, 'lb', 'bologna', 'Bologna, whole chub', 453.592, '5 oz raw → 4 oz cooked, estimate'),
  -- Rub: the sheet says about 0.1 oz per 5 oz raw plate, so mult = 16 oz ÷ 5 oz.
  ('Smoked BBQ Bologna', 2, 0.1, 16 / 5.0, 'oz', 'custom rub (1 tbsp per lb)', 'Custom rub', 28.3495, 'ingredients unknown; get supplier label')
) v(recipe, pos, amount, mult, unit, line, ingredient, g, note)
join public.kitchen_recipes r on r.kitchen_id = (select id from k) and r.name = v.recipe
join public.ingredients i on i.kitchen_id = (select id from k) and lower(i.name) = lower(v.ingredient);

-- ── Batch weights the sheet states (estimates). Salmon and red potatoes are shared ingredients, so their
--    cook loss here is set on the recipe, not the ingredient. ──
update public.kitchen_recipes r set finished_oz_measured = false, finished_oz = case r.name
    when 'Baked Salmon'          then 16 * 4 / 6.0
    when 'Grilled Salmon'        then 16 * 4 / 5.5
    when 'Roasted Red Potatoes'  then 16 * 4 / 5.25
    when 'Spaghetti Sauce (Tone''s)' then 50
    when 'House Salad'           then 2
    when 'Mac and Cheese'        then 100
  end
from public.kitchens k
where k.id = r.kitchen_id and k.name = 'TR Help'
  and r.name in ('Baked Salmon', 'Grilled Salmon', 'Roasted Red Potatoes', 'Spaghetti Sauce (Tone''s)', 'House Salad', 'Mac and Cheese');
