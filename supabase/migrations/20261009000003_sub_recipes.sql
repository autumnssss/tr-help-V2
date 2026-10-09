-- A recipe line can use another recipe (e.g. Boiled Potatoes in Potato Salad).
-- Its oz is the sub-recipe's finished weight per batch.
alter table public.recipe_lines add column sub_recipe_id uuid;
alter table public.recipe_lines
  add foreign key (sub_recipe_id, kitchen_id) references public.kitchen_recipes(id, kitchen_id),
  add check (sub_recipe_id is null or ingredient_id is null),
  add check (sub_recipe_id is distinct from recipe_id);
