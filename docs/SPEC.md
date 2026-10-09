# TR Help V2 — Spec

Status: agreed through grilling session, 2026-10-09. First milestone = **Hotplate CSV in → shopping list out**.

## Problem Statement

We run a weekly order/delivery meal kitchen (Menus A–E plus a build-your-own "Garden Vegetable and Sides" plate). Orders come from Hotplate. Every week someone manually works out how much raw product to buy from the order list, and manually counts how many labels to print in Munbyn. That math is slow and error-prone because every item loses weight between purchase and plate: trimming, peeling, breakdown and cooking (brisket ~50%, pork butt ~45%, Brussels sprouts unpredictable). Guessing wrong means running short or wasting product.

V1 (`autumnssss/tr-help`) stores recipes and prices but cannot scale recipes to orders, does not know about yield loss, has guessed nutrition, and has no login on a database with a public key.

## Solution

Drop the weekly Hotplate prep-list CSV into the app and get back:

1. **Shopping list** — the as-purchased weight (or package/rack count) of every ingredient needed to fill every meal sold, after all yield loss and buffer.
2. **Label counts** — how many Munbyn labels to print per meal (family meals = 3 labels).
3. **Prep sheet** — finished weight of each component to produce, based on what is still left to prep.

The app knows each menu item's components and portions, each recipe's finished yield, and each ingredient's as-purchased → plate-ready yield. Anything it doesn't recognize, it stops and asks about once, then remembers.

## Domain Rules (agreed)

### Portions (finished, plate-ready weight)

| Meal type | Regular | Family |
|---|---|---|
| Standard (protein + starch + veg) | 4 oz + 4 oz + 4 oz | 16 oz + 16 oz + 16 oz |
| Casserole-style (entree + veg) | 8 oz entree + 4 oz veg | 16 oz + 16 oz |
| Garden plate side | 4 oz per side | — |
| By-the-pound items | Quantity = lb of finished product | — |
| Size variations ("6 OZ", "24 ounces") | That many oz of finished product | — |

Exceptions are set per menu item. Current known exception: **ribs**, sold as 4 / 6 / 8 oz, family = 1 full rack + sides.

### Yield and buying

- Every ingredient has one combined **yield %** from as-purchased to plate-ready: trimming, peeling, breakdown and cooking all included. Starches can be over 100% (pasta, grits, rice gain water).
- Defaults come pre-loaded from **USDA Agriculture Handbook 102 (Food Yields)**. Kitchen overrides replace the defaults when real numbers consistently differ. The app shows which source each yield comes from.
- Items flagged as **unpredictable** (e.g. Brussels sprouts) carry an extra **buffer %**.
- **Weight to buy = finished weight needed ÷ yield % × (1 + buffer %).**
- Shopping list shows **lb** by default. Once a package size is entered (2 lb shrimp bag, 10 lb potato case, 1 rack of ribs), it rounds up to whole packages.
- **Ribs** are bought by the rack. Average finished weight per rack is **not yet known** (the chef has the count). Until it's entered, the app asks the first time ribs appear.

### Hotplate CSV (see `tests/fixtures/hotplate-prep-list-2026-10-08.csv`)

Columns: `Window Start, Window End, Item Title, Variation, Description, Quantity, Quantity Prepped, Remaining, Prep Tags, Price`.

- One file = one weekly order. Multiple dates in a file are order dates, not delivery days → one combined shopping list.
- **Shopping list uses `Quantity`. Prep sheet uses `Remaining`.**
- `Price` is ignored: variation prices are add-ons to the base price, so the column is not reliable.
- Item titles are trimmed and matched case-insensitively (the file has trailing spaces).
- Descriptions contain quoted multi-line text → a real CSV parser is required.
- Blank variation = regular. `Family…` = family. `N oz` / `N ounces` = N oz finished.
- Garden plate variations list sides separated by `•`, with an optional `2x` prefix (e.g. `Potato Salad • 2x Honey Glazed Carrots` = 1 potato salad + 2 carrots, 4 oz each). Sides are matched to side recipes by name. The menu letter in the title is ignored.

### Labels

- Labels stay designed and printed in Munbyn. The app only outputs counts.
- Regular = 1 label, family = 3 labels, Garden plate = 1 label. Trial rule, adjustable.

### Nutrition

- Macros only (calories, protein, carbs, fat) **per 4 oz** of each finished item, for reference and for typing into Munbyn labels.
- Calculated from USDA FoodData Central nutrients of the ingredients, divided by the recipe's finished batch weight. Manual override for packaged products.
- No allergen tracking (restaurant/catering, not retail).

## User Stories

1. As the owner, I want to drop the Hotplate CSV into the app, so that I get a shopping list without doing the math.
2. As the owner, I want the shopping list in as-purchased weight, so that I buy enough raw product to fill every meal sold.
3. As the owner, I want yield loss to include trimming, peeling, breakdown and cooking, so that the buy weight is realistic.
4. As the owner, I want standard yields pre-loaded, so that the list works before I've measured anything.
5. As the owner, I want to override any ingredient's yield, so that the app uses our real numbers once we know them.
6. As the owner, I want to see whether a yield is a USDA default or our own number, so that I know which ones to trust.
7. As the owner, I want to flag unpredictable items like Brussels sprouts with a buffer %, so that bad batches don't leave us short.
8. As the owner, I want the list in pounds by default, so that it works on day one.
9. As the owner, I want to enter package sizes per ingredient, so that the list tells me how many bags, cases or racks to buy.
10. As the owner, I want ribs counted in racks, so that the list matches how we buy them.
11. As the owner, I want family meals calculated at 1 lb per component, so that family orders are scaled correctly.
12. As the owner, I want casserole-style meals to use 8 oz entree + 4 oz veg, so that those dishes aren't over-bought.
13. As the owner, I want per-menu-item portion overrides, so that exceptions like ribs are handled.
14. As the owner, I want "by the pound" quantities treated as finished pounds, so that 3 orders of pulled chicken = 3 lb finished.
15. As the owner, I want size variations like "24 ounces" or "6 OZ" read automatically, so that I don't set them up by hand.
16. As the owner, I want Garden plate side choices split into individual 4 oz sides, including "2x" picks, so that each side recipe gets the right count.
17. As the owner, I want the app to stop and ask when a menu item, variation or side isn't linked to recipes, so that nothing is silently left off the list.
18. As the owner, I want the app to remember those links, so that I only set each item up once.
19. As the owner, I want to link a menu item to several component recipes with portions, so that a meal like Chicken Veggie Pasta is built from its parts.
20. As the owner, I want each recipe to store its finished batch weight, so that scaling is orders ÷ yield.
21. As the owner, I want a recipe's finished weight estimated from its ingredients' yields, with a measured override, so that I can start before weighing batches.
22. As the owner, I want recipe ingredients in cups or spoons converted to weight, so that imported recipes still produce a shopping list.
23. As the owner, I want the app to ask once for an ingredient's weight per cup when it can't convert, so that the list is never silently wrong.
24. As the owner, I want one combined shopping list for the whole file, so that I shop once per week.
25. As the owner, I want a prep sheet with finished weight per component based on Remaining, so that the kitchen knows what's left to make.
26. As the owner, I want label counts per meal (family = 3), so that I stop counting the order list by hand.
27. As the owner, I want macros per 4 oz for each item, so that I can key them into new Munbyn labels.
28. As the owner, I want to add recipes from a photo, so that handwritten recipes get in quickly.
29. As the owner, I want to add recipes from a link, so that online recipes get in quickly.
30. As the owner, I want to add recipes from an uploaded file, so that saved documents can be imported.
31. As the owner, I want to type recipes in manually, so that I can enter anything else.
32. As the owner, I want my existing V1 recipes and prices carried over, so that I don't re-enter anything.
33. As a staff member, I want to log in, so that only our kitchen can see and change our data.
34. As the owner, I want every record tied to our kitchen, so that the app can later be sold to other kitchens without a rebuild.
35. As any user, I want the app to work on phone, tablet and computer, so that I can use whatever is in front of me.
36. As the owner, I want recipe costs to come from receipt prices, so that costing uses real prices. *(Milestone 2)*

## Implementation Decisions

- **Stack:** TypeScript + React (Vite), hosted on Netlify. Data and login in the **existing Supabase project** (Supabase Auth). Claude calls stay in a Netlify function (V1 pattern).
- **Multi-kitchen ready, single kitchen used:** every table has a `kitchen_id`. Row-level security limits each user to their kitchen. No billing, sign-up or onboarding for other kitchens.
- **Core modules:**
  - **Hotplate importer** — parses the CSV into order lines `{item, variation, quantity, remaining}`; parses Garden plate variations into side picks with counts.
  - **Menu catalog** — menu items, their meal type (standard / casserole / by-the-pound / side plate), component recipes, portion overrides, variation rules, and remembered title/variation/side aliases.
  - **Recipe book** — recipes with ingredient lines (amount, unit, ingredient link), finished batch weight (estimated or measured), and import from photo / link / file / manual.
  - **Ingredient library** — name, yield % (+ source: USDA default or override), buffer %, unpredictable flag, weight-per-volume conversions, package size + unit, USDA FoodData Central nutrient link, macros override.
  - **Planner (the single core seam)** — a pure function: `(order lines, catalog, recipes, ingredients) → { shoppingList, prepSheet, labelCounts, unresolved[] }`. No I/O. If `unresolved` is non-empty, the UI walks the user through linking each item, then re-runs.
- **Calculation chain:** order line → portions per component (by variation) → finished weight per recipe → batch multiplier (finished needed ÷ finished batch weight) → ingredient as-purchased amounts × multiplier × (1 + buffer) → summed per ingredient → converted to purchase units, rounded up to whole packages.
- **Recipe finished weight** defaults to Σ(as-purchased weight × ingredient yield); a measured value overrides it. Ingredient amounts in recipes are as-purchased.
- **V1 migration:** existing `recipes` (free-text ingredients inside sections) are imported, and their ingredients are matched to the library: automatic where confident, reviewed by the user otherwise. Existing price data is kept for Milestone 2.
- **USDA data:** Handbook 102 yields bundled as seed data for common items; FoodData Central API (free key) for nutrient lookup.
- **Link import:** fetched server-side in a Netlify function, then parsed by Claude. Sites that block fetching fall back to paste.

## Testing Decisions

- Test external behaviour only: given inputs, assert outputs. No tests of internal helpers.
- **Primary seam: the Planner.** Most tests feed order lines + a small catalog and assert the shopping list, prep sheet, label counts and unresolved items.
- **Importer tests** use the real fixture `tests/fixtures/hotplate-prep-list-2026-10-08.csv`. They assert multi-line descriptions parse, titles trim, variations classify, and Garden plate `2x` picks are counted.
- **End-to-end golden test:** fixture CSV + a hand-built catalog → a shopping list checked by hand against kitchen math once, then locked in.
- Key cases: family = 1 lb/component; casserole 8+4; by-the-pound; `N oz` variations; Garden plate sides; buffer applied; yield over 100%; package rounding; unknown item → unresolved, not dropped.
- No prior test art exists (V1 has no tests). Use Vitest.

## Milestones

1. **CSV → shopping list** (this spec's core): login, ingredient library with USDA yields, recipes (manual + photo/text import from V1), menu catalog, Hotplate import, Planner, shopping list, prep sheet, label counts, V1 data migration.
2. Macros per 4 oz, link and file recipe import, recipe costing from receipt prices.
3. Selling memberships to other kitchens (separate decision, not before V2 runs our own kitchen).

## Out of Scope

- On-hand inventory (list is total needed, not net of stock).
- Label design or printing (stays in Munbyn).
- Allergens.
- Full nutrition panels (macros only).
- Customer names / per-customer labels (the prep-list CSV has none).
- Revenue reporting from the CSV `Price` column.
- Billing, sign-up and onboarding for other kitchens.
- Direct Hotplate API integration (CSV upload only).

## Open Items

- **Ribs:** average finished weight per rack (chef has the count).
- **Ribs regular variation:** a blank variation on ribs — which of 4 / 6 / 8 oz is it?
- **Soup regular portion:** blank-variation Broccoli Cheddar Soup — how many oz?
- **Meal type per current menu item** (standard vs casserole), e.g. Chicken Veggie Pasta, Smoked Mac & Cheese w/ Broccoli. Set during first catalog setup.
- **Kitchen-measured yields** to override USDA defaults: brisket 50%, pork butt 45% known; others as measured.
