# Database

Apply migrations in filename order using a restricted migration/deployment
account. `001_initial_schema.sql` creates the initial schema; it does not insert
example inventory or business settings. `002_enquiry_form_fields.sql` is an
additive extension for public enquiry-form fields. No migration was applied as
part of this development phase. Before applying migrations to an existing
project, confirm which have already been applied; do not rerun the initial
non-idempotent `CREATE TABLE` statements against an initialized database.

See [SCHEMA_PLAN.md](./SCHEMA_PLAN.md) for table coverage and module ownership.

Keep customer enquiries, uploaded-image paths, admin notes, assessments, and
audit records private. The API must authenticate administrators and enforce
authorization for every private record operation. Do not expose a privileged
database credential to the frontend. Configure PostgreSQL grants and
row-level-security policies for the deployment's chosen auth strategy before
production use.

Store actual uploaded images in a private object-storage bucket and persist
only storage references here. Use short-lived signed URLs after authorization.
