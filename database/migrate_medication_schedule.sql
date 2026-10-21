ALTER TABLE dispenser_compartments
  ADD COLUMN IF NOT EXISTS dose_unit text NOT NULL DEFAULT 'mg',
  ADD COLUMN IF NOT EXISTS start_time text,
  ADD COLUMN IF NOT EXISTS feeder_position integer;

UPDATE dispenser_compartments
SET dose_unit = CASE
  WHEN btrim(dose) ~* '(^|[[:space:]])µg$' THEN 'µg'
  WHEN btrim(dose) ~* '(^|[[:space:]])mg$' THEN 'mg'
  WHEN btrim(dose) ~* '(^|[[:space:]])g$' THEN 'g'
  WHEN btrim(dose) ~* '(^|[[:space:]])ui$' THEN 'UI'
  ELSE dose_unit
END
WHERE dose_unit = 'mg'
  AND btrim(dose) ~* '(^|[[:space:]])(µg|mg|g|ui)$';

ALTER TABLE dispenser_compartments
  DROP CONSTRAINT IF EXISTS dispenser_compartments_dose_unit_check,
  ADD CONSTRAINT dispenser_compartments_dose_unit_check
    CHECK (dose_unit IN ('mg', 'µg', 'g', 'UI')),
  DROP CONSTRAINT IF EXISTS dispenser_compartments_start_time_check,
  ADD CONSTRAINT dispenser_compartments_start_time_check
    CHECK (start_time IS NULL OR start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  DROP CONSTRAINT IF EXISTS dispenser_compartments_feeder_position_check,
  ADD CONSTRAINT dispenser_compartments_feeder_position_check
    CHECK (feeder_position IS NULL OR feeder_position BETWEEN 1 AND 4);
