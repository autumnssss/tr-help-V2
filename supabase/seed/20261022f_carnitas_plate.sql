-- Menu: Carnitas with Elote and Black Beans (kitchen 2026-10-22). Re-runnable; no deletes.
-- Regular 4/4/4 oz, 6 oz = 6 oz carnitas + 4/4, Family 16/16/16 (3 labels, 3 × 28 oz plates).

with k as (select id from public.kitchens where name = 'TR Help')
insert into public.menu_items (kitchen_id, name, kind)
select k.id, 'Carnitas with Elote and Black Beans', 'meal' from k
where not exists (select 1 from public.menu_items m where m.kitchen_id = k.id and m.name = 'Carnitas with Elote and Black Beans');

with k as (select id from public.kitchens where name = 'TR Help'),
  m as (select m.id from public.menu_items m, k where m.kitchen_id = k.id and m.name = 'Carnitas with Elote and Black Beans')
insert into public.menu_sizes (kitchen_id, menu_item_id, variation, labels)
select (select id from k), m.id, v.variation, v.labels from m, (values ('regular', 1), ('6 oz', 1), ('family', 3)) v(variation, labels)
where not exists (select 1 from public.menu_sizes s where s.menu_item_id = m.id and s.variation = v.variation);

with k as (select id from public.kitchens where name = 'TR Help'),
  s as (select s.id, s.variation from public.menu_sizes s join public.menu_items m on m.id = s.menu_item_id, k
        where m.kitchen_id = k.id and m.name = 'Carnitas with Elote and Black Beans')
insert into public.size_portions (kitchen_id, size_id, recipe_id, oz)
select (select id from k), s.id, r.id, v.oz
from s join (values
  ('regular', 'Carnitas', 4::numeric), ('regular', 'Elote', 4), ('regular', 'Black Beans', 4),
  ('6 oz',    'Carnitas', 6),          ('6 oz',    'Elote', 4), ('6 oz',    'Black Beans', 4),
  ('family',  'Carnitas', 16),         ('family',  'Elote', 16), ('family', 'Black Beans', 16)
) v(variation, recipe, oz) on v.variation = s.variation
join public.kitchen_recipes r on r.kitchen_id = (select id from k) and r.name = v.recipe
where not exists (select 1 from public.size_portions p where p.size_id = s.id and p.recipe_id = r.id);

with k as (select id from public.kitchens where name = 'TR Help'),
  s as (select s.id, s.variation from public.menu_sizes s join public.menu_items m on m.id = s.menu_item_id, k
        where m.kitchen_id = k.id and m.name = 'Carnitas with Elote and Black Beans'),
  c as (select c.id from public.container_types c, k where c.kitchen_id = k.id and c.name = '28 oz plate (single compartment)')
insert into public.size_packaging (kitchen_id, size_id, container_id, qty)
select (select id from k), s.id, c.id, case when s.variation = 'family' then 3 else 1 end
from s, c
where not exists (select 1 from public.size_packaging p where p.size_id = s.id and p.container_id = c.id);
