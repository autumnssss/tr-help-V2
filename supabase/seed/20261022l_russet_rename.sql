-- Kitchen 2026-10-22: "Boiled Potatoes" is russet; name it so (red potatoes are a separate line).
-- Earlier seeds now use the new name; this renames a database seeded before that. Re-runnable.
update public.kitchen_recipes r set name = 'Boiled Russet Potatoes'
from public.kitchens k
where k.id = r.kitchen_id and k.name = 'TR Help' and r.name = 'Boiled Potatoes'
  and not exists (select 1 from public.kitchen_recipes x where x.kitchen_id = k.id and x.name = 'Boiled Russet Potatoes');
