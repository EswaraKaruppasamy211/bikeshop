-- Additive extension for the public enquiry form. Safe to apply to an existing
-- installation; no records are dropped or rewritten.
ALTER TABLE vehicle_purchase_enquiries
    ADD COLUMN IF NOT EXISTS make_name TEXT,
    ADD COLUMN IF NOT EXISTS model_name TEXT,
    ADD COLUMN IF NOT EXISTS fuel_type TEXT;

ALTER TABLE contact_enquiries
    ADD COLUMN IF NOT EXISTS email TEXT;
