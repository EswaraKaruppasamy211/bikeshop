CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE profiles (
    id UUID PRIMARY KEY,
    role TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'admin')),
    display_name TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE product_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    slug TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE vehicle_makes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE vehicle_models (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    make_id UUID NOT NULL REFERENCES vehicle_makes(id),
    name TEXT NOT NULL,
    model_year_start SMALLINT,
    model_year_end SMALLINT,
    UNIQUE (make_id, name),
    CHECK (model_year_start IS NULL OR model_year_start BETWEEN 1886 AND 2200),
    CHECK (model_year_end IS NULL OR model_year_end BETWEEN 1886 AND 2200),
    CHECK (model_year_start IS NULL OR model_year_end IS NULL OR model_year_end >= model_year_start)
);

CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id UUID NOT NULL REFERENCES product_categories(id),
    name TEXT NOT NULL,
    description TEXT,
    part_number TEXT,
    condition TEXT NOT NULL CHECK (condition IN ('excellent', 'good', 'fair', 'poor', 'unassessed')),
    known_defects TEXT,
    price NUMERIC(12, 2) CHECK (price IS NULL OR price >= 0),
    price_type TEXT NOT NULL DEFAULT 'enquiry' CHECK (price_type IN ('fixed', 'enquiry')),
    quantity_available INTEGER NOT NULL DEFAULT 0 CHECK (quantity_available >= 0),
    is_active BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (price_type <> 'fixed' OR price IS NOT NULL)
);
CREATE INDEX products_active_inventory_idx ON products (created_at DESC)
    WHERE is_active = TRUE AND quantity_available > 0;

CREATE TABLE product_images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    storage_path TEXT NOT NULL,
    alt_text TEXT,
    is_public BOOLEAN NOT NULL DEFAULT FALSE,
    sort_order SMALLINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE product_compatibility (
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    model_id UUID NOT NULL REFERENCES vehicle_models(id),
    verification_status TEXT NOT NULL DEFAULT 'unverified'
        CHECK (verification_status IN ('verified', 'unverified')),
    notes TEXT,
    PRIMARY KEY (product_id, model_id)
);

CREATE TABLE vehicle_purchase_enquiries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    customer_name TEXT NOT NULL,
    mobile_number TEXT NOT NULL,
    vehicle_category TEXT NOT NULL,
    make_id UUID REFERENCES vehicle_makes(id),
    model_id UUID REFERENCES vehicle_models(id),
    manufacturing_year SMALLINT CHECK (manufacturing_year IS NULL OR manufacturing_year BETWEEN 1886 AND 2200),
    registration_region TEXT,
    vehicle_condition TEXT,
    known_damage TEXT,
    approximate_location TEXT,
    expected_price NUMERIC(12, 2) CHECK (expected_price IS NULL OR expected_price >= 0),
    additional_notes TEXT,
    status TEXT NOT NULL DEFAULT 'new'
        CHECK (status IN ('new', 'contacted', 'inspection_scheduled', 'price_discussed', 'completed', 'rejected')),
    admin_notes TEXT,
    final_inspection_findings TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX vehicle_enquiries_status_idx ON vehicle_purchase_enquiries (status, created_at DESC);

CREATE TABLE enquiry_images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    enquiry_id UUID NOT NULL REFERENCES vehicle_purchase_enquiries(id) ON DELETE CASCADE,
    storage_path TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE ai_assessments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    enquiry_id UUID REFERENCES vehicle_purchase_enquiries(id) ON DELETE SET NULL,
    user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    subject_type TEXT NOT NULL CHECK (subject_type IN ('vehicle', 'part')),
    visible_score SMALLINT CHECK (visible_score IS NULL OR visible_score BETWEEN 0 AND 100),
    condition_category TEXT NOT NULL CHECK (condition_category IN (
        'excellent', 'good', 'fair', 'poor', 'very_poor', 'insufficient_evidence', 'unable_to_assess'
    )),
    confidence NUMERIC(4, 3) CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1),
    image_quality TEXT,
    summary TEXT NOT NULL,
    inspection_limitations TEXT NOT NULL,
    provider TEXT,
    model TEXT,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'completed', 'failed', 'reviewed')),
    admin_confirmed_findings TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE ai_assessment_findings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assessment_id UUID NOT NULL REFERENCES ai_assessments(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    severity TEXT NOT NULL CHECK (severity IN ('none', 'minor', 'moderate', 'severe', 'uncertain')),
    confidence NUMERIC(4, 3) CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1),
    recommended_inspection TEXT
);

CREATE TABLE ai_assessment_images (
    assessment_id UUID NOT NULL REFERENCES ai_assessments(id) ON DELETE CASCADE,
    image_id UUID NOT NULL REFERENCES enquiry_images(id) ON DELETE CASCADE,
    PRIMARY KEY (assessment_id, image_id)
);

CREATE TABLE contact_enquiries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_name TEXT NOT NULL,
    mobile_number TEXT NOT NULL,
    message TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'completed', 'rejected')),
    admin_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE business_settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE audit_logs (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    actor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
