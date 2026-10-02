CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text UNIQUE,
  full_name text,
  avatar_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dispenser_compartments (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  slot integer NOT NULL,
  medication_name text NOT NULL DEFAULT 'Sin asignar',
  dose text DEFAULT '',
  frequency_hours integer CHECK (frequency_hours IS NULL OR frequency_hours BETWEEN 1 AND 168),
  amount integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT false,
  notes text DEFAULT '',
  rotation integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, slot)
);

CREATE TABLE IF NOT EXISTS dispenser_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text DEFAULT 'Mi dispensador',
  wifi_name text DEFAULT '',
  connection_status text DEFAULT 'Sin configurar',
  voice_message text DEFAULT '',
  night_start text DEFAULT '00:00',
  night_end text DEFAULT '06:00',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  message text NOT NULL,
  priority text DEFAULT 'normal',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dispense_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  slot integer NOT NULL,
  medication_name text NOT NULL,
  message text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

-- Migrate existing shared tables. Legacy rows without an owner are demo/shared data.
ALTER TABLE dispenser_compartments ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE dispenser_settings ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE dispense_events ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

DELETE FROM dispenser_compartments WHERE user_id IS NULL;
DELETE FROM dispenser_settings WHERE user_id IS NULL;
DELETE FROM notifications WHERE user_id IS NULL;
DELETE FROM dispense_events WHERE user_id IS NULL;

ALTER TABLE dispenser_compartments ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE dispenser_settings ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE notifications ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE dispense_events ALTER COLUMN user_id SET NOT NULL;

ALTER TABLE dispenser_compartments DROP CONSTRAINT IF EXISTS dispenser_compartments_pkey;
ALTER TABLE dispenser_compartments ADD CONSTRAINT dispenser_compartments_pkey PRIMARY KEY (user_id, slot);
CREATE UNIQUE INDEX IF NOT EXISTS dispenser_settings_user_id_uidx ON dispenser_settings (user_id);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE dispenser_compartments ENABLE ROW LEVEL SECURITY;
ALTER TABLE dispenser_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE dispense_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow users to read own profile" ON profiles;
CREATE POLICY "Allow users to read own profile"
ON profiles FOR SELECT TO authenticated
USING (auth.uid() = id);

DROP POLICY IF EXISTS "Allow users to upsert own profile" ON profiles;
CREATE POLICY "Allow users to upsert own profile"
ON profiles FOR INSERT TO authenticated
WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Allow users to update own profile" ON profiles;
CREATE POLICY "Allow users to update own profile"
ON profiles FOR UPDATE TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

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
