-- Kitchen 2026-10-15: "28 oz long plate" and "28 oz plate" are the same single-compartment
-- plate, and every family pack (except ribs) goes in 3 of them. Re-runnable.
do $$
declare k uuid := (select id from public.kitchens where name = 'TR Help');
        plate uuid; long uuid;
begin
  select id into plate from public.container_types where kitchen_id = k and name = '28 oz plate';
  select id into long from public.container_types where kitchen_id = k and name = '28 oz long plate';
  if long is not null then
    if plate is null then
      update public.container_types set name = '28 oz plate' where id = long;
      plate := long;
    else
      update public.size_packaging set container_id = plate where container_id = long;
      delete from public.container_types where id = long;
    end if;
  end if;
  update public.container_types set name = '28 oz plate (single compartment)' where id = plate;

  -- Family packs that still use the old sheet's 24 oz long plates.
  update public.size_packaging p set container_id = plate, qty = 3
  from public.menu_sizes s join public.menu_items m on m.id = s.menu_item_id
  where p.size_id = s.id and m.kitchen_id = k and s.variation = 'family'
    and m.name <> 'Ribs with Corn Niblets & Potato Salad'
    and p.container_id = (select id from public.container_types where kitchen_id = k and name = '24 oz long plate');
end $$;
