-- White Bean Chicken Chili (copied from V1 2026-10-15). Weights computed here in SQL:
-- cans × can size, cups of broth × one broth batch, cooked chicken ÷ breast yield = raw to buy.
-- Re-runnable.
select set_config('seed.kitchen', (select id::text from public.kitchens where name = 'TR Help'), false);
create or replace function pg_temp.k() returns uuid language sql stable as $$ select current_setting('seed.kitchen')::uuid $$;
create or replace function pg_temp.r(n text) returns uuid language sql stable as $$
  select id from public.kitchen_recipes where kitchen_id = pg_temp.k() and name = n order by (v1_id is null) limit 1
$$;
create or replace function pg_temp.ing(n text, y numeric default 1, unit text default null, unit_oz numeric default null, cat text default null) returns uuid language plpgsql as $$
declare r uuid;
begin
  select id into r from public.ingredients where kitchen_id = pg_temp.k() and lower(name) = lower(n);
  if r is null then insert into public.ingredients (kitchen_id, name, yield, yield_source, purchase_unit, purchase_oz, category)
    values (pg_temp.k(), n, y, 'estimate', unit, unit_oz, cat) returning id into r; end if;
  return r;
end $$;

select pg_temp.ing('White beans, canned (15 oz)', 0.60, 'cans', 15, 'Canned & Dry');      -- drained and rinsed
select pg_temp.ing('Diced green chilies (4 oz can)', 1, 'cans', 4, 'Canned & Dry');
update public.kitchen_recipes set method = 'simmer' where id = pg_temp.r('White Bean Chicken Chili');

update public.recipe_lines l set ingredient_id = v.ing, oz = v.oz
from (values
  ('olive oil',            pg_temp.ing('Olive oil'),                       0.5::numeric),
  ('yellow onion',         pg_temp.ing('Yellow onion'),                    5.3),
  ('garlic cloves',        pg_temp.ing('Garlic'),                          0.32),
  ('chicken breast',       pg_temp.ing('Chicken breast, boneless skinless'), 16 / (select yield from public.ingredients where id = pg_temp.ing('Chicken breast, boneless skinless'))),
  ('white beans',          pg_temp.ing('White beans, canned (15 oz)'),     2 * 15),
  ('diced green chilies',  pg_temp.ing('Diced green chilies (4 oz can)'),  2 * 4),
  ('cream cheese',         pg_temp.ing('Cream cheese, 8 oz block'),        8)
) v(line, ing, oz)
where l.recipe_id = pg_temp.r('White Bean Chicken Chili') and l.raw_name = v.line;
update public.recipe_lines l set ingredient_id = null, sub_recipe_id = pg_temp.r('Chicken Broth'),
  oz = l.amount * (select sum(b.oz) from public.recipe_lines b where b.recipe_id = pg_temp.r('Chicken Broth'))
where l.recipe_id = pg_temp.r('White Bean Chicken Chili') and l.raw_name = 'chicken broth';
