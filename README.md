# tr-help-V2

V2 of TR Help, the kitchen management tool (recipes, shopping lists, costing, prices).

`.claude/skills/` holds `grilling` and `grill-me` from [mattpocock/skills](https://github.com/mattpocock/skills) (MIT).

- `npm run dev`: app (needs `.env`, see `.env.example`). `npm test`: unit tests. `npm run test:db`: migrations + RLS checks on local Postgres.
- Spec: `docs/SPEC.md`. Supabase / login / V1 migration setup: `docs/SETUP.md`.
