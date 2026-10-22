-- V1 is retired (kitchen 2026-10-22). Everything it held is in V2: recipes in kitchen_recipes (v1_id kept for
-- reference), prices in price_quotes. Its two tables were open to anyone with the public key ("Allow all"),
-- so they go. No backup by the kitchen's choice; the recipes and prices are kept elsewhere too.
drop table if exists public.recipes;
drop table if exists public.prices;
