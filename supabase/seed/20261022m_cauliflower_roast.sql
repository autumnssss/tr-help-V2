-- Kitchen sheet 2026-10-22: Cauliflower & Peas is roasted (425°F), so it belongs on the Roast station. Re-runnable.
update public.kitchen_recipes r set method = 'roast'
from public.kitchens k where k.id = r.kitchen_id and k.name = 'TR Help' and r.name = 'Cauliflower & Peas' and r.method is null;
