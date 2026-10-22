-- Kitchen 2026-10-22. Re-runnable; no deletes.
-- * Baked sweet potato: about 8 oz each. One recipe batch = one topped potato, so a piece weighs one batch.
-- * Menu: Smoked beef with potato salad, Mac & Cheese — 4/4/4 (smoked beef = Smoked Brisket by default; chuck
--   roast some weeks), regular potato salad, Smoked Mac & Cheese. 6 oz = 6 oz beef. Hotplate's option is typed
--   "6 0Z" (zero) on some orders, so that spelling is a size too. Family 16/16/16, 3 labels, 3 × 28 oz plates.
-- * Menu: Baked Sweet Potato with Brie — one potato per order, 1 label. Container not set yet.

update public.recipe_lines l set amount = 1, unit = 'each', oz = 8, note = 'about 8 oz each (kitchen)'
from public.kitchen_recipes r, public.kitchens k
where l.recipe_id = r.id and r.kitchen_id = k.id and k.name = 'TR Help'
  and r.name = 'Baked Sweet Potato with Brie' and l.position = 1;

update public.kitchen_recipes r set
  finished_oz = (select sum(l.oz) from public.recipe_lines l where l.recipe_id = r.id),
  oz_per_piece = (select sum(l.oz) from public.recipe_lines l where l.recipe_id = r.id),
  finished_oz_measured = false, notes = 'One per order. Batch = one topped potato.'
from public.kitchens k where k.id = r.kitchen_id and k.name = 'TR Help' and r.name = 'Baked Sweet Potato with Brie';

with k as (select id from public.kitchens where name = 'TR Help')
insert into public.menu_items (kitchen_id, name, kind)
select k.id, v.name, 'meal' from k, (values ('Smoked beef with potato salad, Mac & Cheese'), ('Baked Sweet Potato with Brie')) v(name)
where not exists (select 1 from public.menu_items m where m.kitchen_id = k.id and m.name = v.name);

with k as (select id from public.kitchens where name = 'TR Help')
insert into public.menu_sizes (kitchen_id, menu_item_id, variation, labels)
select k.id, m.id, v.variation, v.labels
from k, (values
  ('Smoked beef with potato salad, Mac & Cheese', 'regular', 1),
  ('Smoked beef with potato salad, Mac & Cheese', '6 oz',    1),
  ('Smoked beef with potato salad, Mac & Cheese', '6 0z',    1),
  ('Smoked beef with potato salad, Mac & Cheese', 'family',  3),
  ('Baked Sweet Potato with Brie',                'regular', 1)
) v(item, variation, labels)
join public.menu_items m on m.kitchen_id = (select id from k) and m.name = v.item
where not exists (select 1 from public.menu_sizes s where s.menu_item_id = m.id and s.variation = v.variation);

with k as (select id from public.kitchens where name = 'TR Help')
insert into public.size_portions (kitchen_id, size_id, recipe_id, oz, pieces)
select k.id, s.id, r.id, v.oz, v.pieces
from k, (values
  ('Smoked beef with potato salad, Mac & Cheese', 'regular', 'Smoked Brisket',      4::numeric, null::numeric),
  ('Smoked beef with potato salad, Mac & Cheese', 'regular', 'Potato Salad',        4,  null),
  ('Smoked beef with potato salad, Mac & Cheese', 'regular', 'Smoked Mac & Cheese', 4,  null),
  ('Smoked beef with potato salad, Mac & Cheese', '6 oz',    'Smoked Brisket',      6,  null),
  ('Smoked beef with potato salad, Mac & Cheese', '6 oz',    'Potato Salad',        4,  null),
  ('Smoked beef with potato salad, Mac & Cheese', '6 oz',    'Smoked Mac & Cheese', 4,  null),
  ('Smoked beef with potato salad, Mac & Cheese', '6 0z',    'Smoked Brisket',      6,  null),
  ('Smoked beef with potato salad, Mac & Cheese', '6 0z',    'Potato Salad',        4,  null),
  ('Smoked beef with potato salad, Mac & Cheese', '6 0z',    'Smoked Mac & Cheese', 4,  null),
  ('Smoked beef with potato salad, Mac & Cheese', 'family',  'Smoked Brisket',      16, null),
  ('Smoked beef with potato salad, Mac & Cheese', 'family',  'Potato Salad',        16, null),
  ('Smoked beef with potato salad, Mac & Cheese', 'family',  'Smoked Mac & Cheese', 16, null),
  ('Baked Sweet Potato with Brie',                'regular', 'Baked Sweet Potato with Brie', null, 1)
) v(item, variation, recipe, oz, pieces)
join public.menu_items m on m.kitchen_id = (select id from k) and m.name = v.item
join public.menu_sizes s on s.menu_item_id = m.id and s.variation = v.variation
join public.kitchen_recipes r on r.kitchen_id = (select id from k) and r.name = v.recipe
where not exists (select 1 from public.size_portions p where p.size_id = s.id and p.recipe_id = r.id);

with k as (select id from public.kitchens where name = 'TR Help'),
  c as (select c.id from public.container_types c, k where c.kitchen_id = k.id and c.name = '28 oz plate (single compartment)')
insert into public.size_packaging (kitchen_id, size_id, container_id, qty)
select (select id from k), s.id, c.id, case when s.variation = 'family' then 3 else 1 end
from public.menu_sizes s join public.menu_items m on m.id = s.menu_item_id, c
where m.kitchen_id = (select id from k) and m.name = 'Smoked beef with potato salad, Mac & Cheese'
  and not exists (select 1 from public.size_packaging p where p.size_id = s.id and p.container_id = c.id);
