-- Apply once in Supabase SQL Editor to upgrade the existing shared schema.
-- Legacy rows have no account owner, so they are deleted instead of exposed to every user.

ALTER TABLE dispenser_compartments
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE dispenser_settings
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE dispense_events
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

DELETE FROM dispenser_compartments WHERE user_id IS NULL;
DELETE FROM dispenser_settings WHERE user_id IS NULL;
DELETE FROM notifications WHERE user_id IS NULL;
DELETE FROM dispense_events WHERE user_id IS NULL;

ALTER TABLE dispenser_compartments ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE dispenser_settings ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE notifications ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE dispense_events ALTER COLUMN user_id SET NOT NULL;

ALTER TABLE dispenser_compartments DROP CONSTRAINT IF EXISTS dispenser_compartments_pkey;
ALTER TABLE dispenser_compartments
  ADD CONSTRAINT dispenser_compartments_pkey PRIMARY KEY (user_id, slot);
CREATE UNIQUE INDEX IF NOT EXISTS dispenser_settings_user_id_uidx
  ON dispenser_settings (user_id);

ALTER TABLE dispenser_compartments ENABLE ROW LEVEL SECURITY;
ALTER TABLE dispenser_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE dispense_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anon read/write on compartments" ON dispenser_compartments;
DROP POLICY IF EXISTS "Allow users to manage own compartments" ON dispenser_compartments;
CREATE POLICY "Allow users to manage own compartments"
  ON dispenser_compartments FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Allow anon read/write on settings" ON dispenser_settings;
DROP POLICY IF EXISTS "Allow users to manage own settings" ON dispenser_settings;
CREATE POLICY "Allow users to manage own settings"
  ON dispenser_settings FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Allow anon read/write on notifications" ON notifications;
DROP POLICY IF EXISTS "Allow users to manage own notifications" ON notifications;
CREATE POLICY "Allow users to manage own notifications"
  ON notifications FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Allow anon read/write on dispense_events" ON dispense_events;
DROP POLICY IF EXISTS "Allow users to manage own dispense events" ON dispense_events;
CREATE POLICY "Allow users to manage own dispense events"
  ON dispense_events FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
