-- Recipes made by count (12 treats, 5 loaves, 5 pie crusts): scaled by how many you need.
-- Archived recipes stay in the database but don't show or plan.
alter table public.kitchen_recipes add column yield_count numeric check (yield_count > 0);
alter table public.kitchen_recipes add column yield_unit text;
alter table public.kitchen_recipes add column archived boolean not null default false;
