-- Simmer station (soups, sauces, gravy, grits); prep groups for lines sharing a pot or
-- water ('Salted water'); and recipes with no prep line of their own (broth from base).
alter table public.kitchen_recipes drop constraint kitchen_recipes_method_check;
alter table public.kitchen_recipes add constraint kitchen_recipes_method_check
  check (method in ('smoke', 'braise', 'boil', 'simmer', 'grill', 'roast', 'saute', 'bake', 'no-cook'));
alter table public.kitchen_recipes add column prep_group text;
alter table public.kitchen_recipes add column on_prep_sheet boolean not null default true;
