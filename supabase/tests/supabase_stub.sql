-- Minimal stand-in for what Supabase provides, so migrations run on plain Postgres.
create extension if not exists pgcrypto;
create role anon nologin;
create role authenticated nologin;
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;

-- V1 tables as the V1 app uses them.
create table public.recipes (
  id bigint generated always as identity primary key,
  name text, yield_qty numeric, yield_label text, bake_note text, freeze_note text,
  sections jsonb, steps text, sell_price numeric
);
create table public.prices (
  id bigint generated always as identity primary key,
  item text, store text, price numeric, unit text, updated_at text
);
insert into public.recipes (name, bake_note, sections, steps) values
  ('Brisket', 'Smoke 225F 12 hr', '[{"label":"","ingredients":[
     {"amt":"12","unit":"lb","name":"brisket packer","note":"","cost":40},
     {"amt":"1/2","unit":"cup","name":"beef rub","note":"","cost":2},
     {"amt":"1 1/2","unit":"oz.","name":"kosher salt","note":"","cost":0},
     {"amt":"16 oz","unit":"bag","name":"mini marshmallows"},
     {"amt":"2","unit":"15-oz can","name":"black beans"},
     {"amt":"28","unit":"ounce can","name":"crushed tomatoes"},
     {"amt":"2","unit":"sticks","name":"unsalted butter"},
     {"amt":"1","unit":"2.5-3 lb","name":"whole chicken"}]}]', 'Trim\nSmoke'),
  ('Cookies', null, to_jsonb('[{"label":"DRY","ingredients":[{"amt":"½","unit":"cups","name":"flour"},{"amt":"","unit":"","name":""}]},{"label":"WET","ingredients":[{"amt":"250","unit":"g","name":"butter"}]}]'::text), '');
insert into public.prices (item, store, price, unit, updated_at) values
  ('brisket', 'Costco', 3.99, '1 lb', '2026-05-01'), ('flour', 'Aldi', 2.49, '5 lb', '2026-05-02');
