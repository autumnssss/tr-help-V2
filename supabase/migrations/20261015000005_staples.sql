-- Staples the kitchen always has (kept off the shopping list) and store sections for grouping it.
alter table public.ingredients add column staple boolean not null default false;
alter table public.ingredients add column category text;
