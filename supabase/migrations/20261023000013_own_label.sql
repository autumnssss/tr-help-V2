-- Meals that already carry their own nutrition label (kitchen 2026-10-23): the Nutrition tab lists them
-- by name instead of asking for their recipes' data.
alter table public.menu_items add column own_label boolean not null default false;
