-- Week of Oct 27 prep list (kitchen 2026-10-22). Re-runnable; no deletes.
-- * Hotplate title "Smoked Beef - by the pound" = the existing Smoked Beef by the pound.
-- * Garden plate side names → recipes.
-- * Smoked Cream Cheese flavor "Worcestershire & Black Pepper" = one smoked cream cheese, like regular.

with k as (select id from public.kitchens where name = 'TR Help')
insert into public.menu_titles (kitchen_id, menu_item_id, title)
select k.id, m.id, 'Smoked Beef - by the pound'
from k join public.menu_items m on m.kitchen_id = k.id and m.name = 'Smoked Beef by the pound'
where not exists (select 1 from public.menu_titles t where t.menu_item_id = m.id and t.title = 'Smoked Beef - by the pound');

with k as (select id from public.kitchens where name = 'TR Help')
insert into public.side_links (kitchen_id, side_name, recipe_id)
select k.id, v.side, r.id
from k, (values
  ('Macaroni & Cheese',         'Smoked Mac & Cheese'),
  ('Elote/Mexican Street Corn', 'Elote'),
  ('Cauliflower and Peas',      'Cauliflower & Peas'),
  ('Sweet Potatoes',            'Roasted Sweet Potatoes')
) v(side, recipe)
join public.kitchen_recipes r on r.kitchen_id = (select id from k) and r.name = v.recipe
where not exists (select 1 from public.side_links s where s.kitchen_id = k.id and s.side_name = v.side);

with k as (select id from public.kitchens where name = 'TR Help')
insert into public.menu_sizes (kitchen_id, menu_item_id, variation, labels)
select k.id, m.id, 'worcestershire & black pepper', 1
from k join public.menu_items m on m.kitchen_id = k.id and m.name = 'Smoked Cream Cheese'
where not exists (select 1 from public.menu_sizes s where s.menu_item_id = m.id and s.variation = 'worcestershire & black pepper');

-- Same portion as regular.
insert into public.size_portions (kitchen_id, size_id, recipe_id, oz, pieces)
select p.kitchen_id, s.id, p.recipe_id, p.oz, p.pieces
from public.menu_items m
join public.kitchens k on k.id = m.kitchen_id and k.name = 'TR Help'
join public.menu_sizes reg on reg.menu_item_id = m.id and reg.variation = 'regular'
join public.size_portions p on p.size_id = reg.id
join public.menu_sizes s on s.menu_item_id = m.id and s.variation = 'worcestershire & black pepper'
where m.name = 'Smoked Cream Cheese'
  and not exists (select 1 from public.size_portions x where x.size_id = s.id and x.recipe_id = p.recipe_id);
