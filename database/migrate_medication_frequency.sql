-- Store each medication interval as a machine-readable number of hours.
ALTER TABLE dispenser_compartments
  ADD COLUMN IF NOT EXISTS frequency_hours integer;

ALTER TABLE dispenser_compartments
  DROP CONSTRAINT IF EXISTS dispenser_compartments_frequency_hours_check;
ALTER TABLE dispenser_compartments
  ADD CONSTRAINT dispenser_compartments_frequency_hours_check
  CHECK (frequency_hours IS NULL OR frequency_hours BETWEEN 1 AND 168);
