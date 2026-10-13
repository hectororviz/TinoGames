-- PIN público para compartir niveles (formato XXXX-XXXX).
ALTER TABLE levels ADD COLUMN IF NOT EXISTS pin TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS levels_pin_idx ON levels(pin);
