# TR Help V2 — working rules

- **Never use model math. Only use coded math.** Every quantity reported to the kitchen
  (weights, counts, totals, conversions, yields applied) must come from running the planner
  or a script, never from mental arithmetic. If a number isn't produced by code, don't state it.
- Recipe inputs that are estimates (volume → weight conversions, yields, ratios) are labelled
  `estimate` in the data and called out as estimates, not presented as facts.
- Spec: `docs/SPEC.md`. Setup: `docs/SETUP.md`. Wishlist: `docs/WISHLIST.md`.
- Schema changes go in `supabase/migrations/`; `supabase/seed/` holds the local test data.
  Check with `npm test` and `npm run test:db` before applying to Supabase.
- **Recipes are edited in the app now (2026-10-23).** The database is the source of truth for kitchen data.
  Never re-run `supabase/seed/` files against Supabase: they would overwrite edits made in the app. Seeds are
  for local tests only; data fixes on Supabase are one-off, targeted statements.
