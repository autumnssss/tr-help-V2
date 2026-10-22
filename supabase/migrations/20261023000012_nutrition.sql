-- Nutrition panels per meal (kitchen 2026-10-23).
-- Per 100 g: {"kcal", "protein", "carbs", "fat", "basis": "raw"|"cooked", "source": "USDA …" | "package label", "fdc_id"?}.
-- Null = no data yet (the meal's panel lists it as missing; nothing is guessed).
alter table public.ingredients add column nutrition jsonb;
-- Padding added before rounding, e.g. {"kcal": 0.1, "protein": 0, "carbs": 0.1, "fat": 0.1} = +10%.
alter table public.kitchens add column macro_padding jsonb not null default '{"kcal": 0, "protein": 0, "carbs": 0, "fat": 0}';
