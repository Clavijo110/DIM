ALTER TABLE public.dispenser_compartments
  ADD COLUMN IF NOT EXISTS pill_size text,
  ADD COLUMN IF NOT EXISTS feeder_position integer;

UPDATE public.dispenser_compartments
SET pill_size = CASE feeder_position
  WHEN 1 THEN 'small'
  WHEN 2 THEN 'medium'
  WHEN 4 THEN 'large'
  ELSE NULL
END
WHERE pill_size IS NULL AND feeder_position IS NOT NULL;

ALTER TABLE public.dispenser_compartments
  DROP CONSTRAINT IF EXISTS dispenser_compartments_pill_size_check,
  ADD CONSTRAINT dispenser_compartments_pill_size_check
    CHECK (pill_size IS NULL OR pill_size IN ('large', 'small', 'medium'));

NOTIFY pgrst, 'reload schema';
