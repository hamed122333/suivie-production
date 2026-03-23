-- Update existing installs to new role model.
-- We keep existing users; we map legacy 'admin' to 'super_admin'.

BEGIN;

UPDATE users
SET role = 'super_admin'
WHERE role = 'admin';

COMMIT;

