-- What one "each" of an ingredient is called on the shopping list (kitchen 2026-10-29): garlic shows as
-- "6 cloves (⅓ head)" — grams_per_each is the weight of one clove, purchase_unit the head it's bought as.
alter table public.ingredients add column each_unit text;
