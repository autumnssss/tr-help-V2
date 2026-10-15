-- A finished batch weight weighed in this kitchen (vs an estimate). Until set, servings show as estimates.
alter table public.kitchen_recipes add column finished_oz_measured boolean not null default false;
