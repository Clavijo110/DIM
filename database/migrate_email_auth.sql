DROP INDEX IF EXISTS profiles_username_normalized_uidx;
ALTER TABLE profiles DROP COLUMN IF EXISTS username_normalized;
ALTER TABLE profiles DROP COLUMN IF EXISTS username;
ALTER TABLE profiles DROP COLUMN IF EXISTS phone;
