-- Voeg betaalkolommen toe aan profielen als ze nog niet bestaan
ALTER TABLE public.profielen
  ADD COLUMN IF NOT EXISTS plan_actief     boolean   NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS plan_gestart_op timestamptz;
