-- A side sold by the piece (kitchen 2026-11-13: Corn Niblets, 3 pieces per pick) counts that many pieces on a
-- side plate instead of the plate's usual side weight. Null = the usual weight.
alter table public.side_links add column pieces numeric check (pieces > 0);
