-- Copy V1 recipes and prices into the V2 tables for the TR Help kitchen.
-- Safe to re-run: rows already copied (matched on v1_id) are skipped.
-- V1's tables are read only, never changed.
--
-- Recipe lines keep what V1 said (amount, unit, name). Weights are converted
-- to oz now (see line_oz). Volume/count units stay null until the ingredient gets
-- a grams-per-cup or is linked; the planner flags those lines, it never guesses.
-- Ingredient links are left empty: the library starts empty, so matching
-- happens in the review screen.

insert into public.kitchens (name)
select 'TR Help' where not exists (select 1 from public.kitchens where name = 'TR Help');

-- "2", "1.5", "1/2", "1 1/2", "½", "1½", "2-3" (takes the first number) → numeric, else null.
create function pg_temp.parse_amount(t text) returns numeric
language plpgsql immutable as $$
declare
  s text := trim(coalesce(t, ''));
  m text[];
begin
  s := replace(replace(replace(replace(replace(replace(replace(replace(s,
    '½', ' 1/2'), '¼', ' 1/4'), '¾', ' 3/4'), '⅓', ' 1/3'), '⅔', ' 2/3'), '⅛', ' 1/8'), '⅜', ' 3/8'), '⅝', ' 5/8');
  s := trim(regexp_replace(s, '\s*[-–]\s*\d.*$', ''));
  m := regexp_match(s, '^(\d+)\s+(\d+)/(\d+)$');
  if m is not null then return m[1]::numeric + m[2]::numeric / nullif(m[3]::numeric, 0); end if;
  m := regexp_match(s, '^(\d+)/(\d+)$');
  if m is not null then return m[1]::numeric / nullif(m[2]::numeric, 0); end if;
  m := regexp_match(s, '^(\d+(?:\.\d+)?|\.\d+)$');
  if m is not null then return m[1]::numeric; end if;
  return null;
end $$;

-- Ounces per one unit, for weight units only.
create function pg_temp.oz_per_unit(u text) returns numeric
language sql immutable as $$
  select case regexp_replace(lower(trim(coalesce(u, ''))), '\.', '', 'g')
    when 'oz' then 1 when 'ounce' then 1 when 'ounces' then 1
    when 'lb' then 16 when 'lbs' then 16 when 'pound' then 16 when 'pounds' then 16
    when 'g' then 1 / 28.349523125 when 'gram' then 1 / 28.349523125 when 'grams' then 1 / 28.349523125
    when 'kg' then 1000 / 28.349523125
    else null end
$$;

-- As-purchased oz for one V1 line, or null when it can't be known without a
-- weight per cup / per piece. Handles: amount × weight unit ("2" "lb"),
-- weight in the amount ("16 oz" "bag"), package size in the unit
-- ("1" "15-oz can", "28" "ounce can"), and sticks of butter (4 oz).
create function pg_temp.line_oz(amt text, unit text) returns numeric
language plpgsql immutable as $$
declare
  a numeric := pg_temp.parse_amount(amt);
  u text := regexp_replace(lower(trim(coalesce(unit, ''))), '\.', '', 'g');
  m text[];
begin
  if a is not null and pg_temp.oz_per_unit(u) is not null then return a * pg_temp.oz_per_unit(u); end if;
  m := regexp_match(lower(trim(coalesce(amt, ''))), '^(\d+(?:\.\d+)?)\s*-?\s*([a-z]+)$');
  if m is not null and pg_temp.oz_per_unit(m[2]) is not null then return m[1]::numeric * pg_temp.oz_per_unit(m[2]); end if;
  m := regexp_match(u, '^(\d+(?:\.\d+)?)\s*-?\s*(oz|ounce|ounces|lb|lbs|g)\s+(can|jar|bag|box|package|pkg|bottle|container)s?$');
  if a is not null and m is not null then return a * m[1]::numeric * pg_temp.oz_per_unit(m[2]); end if;
  if a is not null and u ~ '^(ounce|ounces|oz)\s+(can|jar|bag|box|package|pkg|bottle|container)s?$' then return a; end if;
  if a is not null and u in ('stick', 'sticks') then return a * 4; end if;
  return null;
end $$;

-- V1 stored sections as jsonb (or as JSON text); normalize to a jsonb array.
create function pg_temp.sections(v jsonb) returns jsonb
language sql immutable as $$
  select case jsonb_typeof(v)
    when 'array' then v
    when 'string' then coalesce((v #>> '{}')::jsonb, '[]'::jsonb)
    else '[]'::jsonb end
$$;

with k as (select id from public.kitchens where name = 'TR Help'),
v1 as (select to_jsonb(r) as j from public.recipes r),
ins as (
  insert into public.kitchen_recipes (kitchen_id, name, method, steps, notes, v1_id, v1_data)
  select k.id,
         coalesce(nullif(trim(v1.j->>'name'), ''), 'Untitled V1 recipe'),
         null,
         coalesce(v1.j->>'steps', ''),
         concat_ws(E'\n', nullif(v1.j->>'bake_note', ''), nullif(v1.j->>'freeze_note', '')),
         v1.j->>'id',
         v1.j
  from v1, k
  on conflict (kitchen_id, v1_id) do nothing
  returning id, kitchen_id, v1_data
)
insert into public.recipe_lines (kitchen_id, recipe_id, position, section, amount, unit, raw_name, note, oz)
select ins.kitchen_id, ins.id,
       (sec.n - 1) * 1000 + ing.n,
       coalesce(sec.s->>'label', ''),
       pg_temp.parse_amount(ing.i->>'amt'),
       coalesce(trim(ing.i->>'unit'), ''),
       coalesce(trim(ing.i->>'name'), ''),
       coalesce(ing.i->>'note', ''),
       pg_temp.line_oz(ing.i->>'amt', ing.i->>'unit')
from ins
cross join lateral jsonb_array_elements(pg_temp.sections(ins.v1_data->'sections')) with ordinality as sec(s, n)
cross join lateral jsonb_array_elements(coalesce(sec.s->'ingredients', '[]'::jsonb)) with ordinality as ing(i, n)
where coalesce(trim(ing.i->>'name'), '') <> '';

insert into public.price_quotes (kitchen_id, item, store, price, unit, observed_on, v1_id)
select k.id, p.j->>'item', coalesce(p.j->>'store', ''), (p.j->>'price')::numeric,
       coalesce(p.j->>'unit', ''), (p.j->>'updated_at')::date, p.j->>'id'
from (select to_jsonb(p) as j from public.prices p) p,
     (select id from public.kitchens where name = 'TR Help') k
where p.j->>'price' is not null
on conflict (kitchen_id, v1_id) do nothing;
