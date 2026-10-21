ALTER TABLE dispenser_compartments
  ADD COLUMN IF NOT EXISTS pills_per_dose integer NOT NULL DEFAULT 1;

ALTER TABLE dispenser_compartments
  DROP CONSTRAINT IF EXISTS dispenser_compartments_pills_per_dose_check,
  ADD CONSTRAINT dispenser_compartments_pills_per_dose_check
    CHECK (pills_per_dose BETWEEN 1 AND 60);
