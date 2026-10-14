-- Portions counted in pieces (9 shrimp, 2 cracker packs), prep-only menu items
-- (Artisan Sweets: on the prep list, not the shopping list), and "estimate" as a
-- yield source so placeholders never pass for USDA or kitchen numbers.

alter table public.kitchen_recipes add column oz_per_piece numeric check (oz_per_piece > 0);

alter table public.size_portions alter column oz drop not null;
alter table public.size_portions add column pieces numeric check (pieces > 0);
alter table public.size_portions add constraint size_portions_oz_or_pieces check ((oz is null) <> (pieces is null));

alter table public.menu_items drop constraint menu_items_kind_check;
alter table public.menu_items add constraint menu_items_kind_check check (kind in ('meal', 'sidePlate', 'prepOnly'));

alter table public.ingredients drop constraint ingredients_yield_source_check;
alter table public.ingredients add constraint ingredients_yield_source_check check (yield_source in ('usda', 'kitchen', 'estimate'));
