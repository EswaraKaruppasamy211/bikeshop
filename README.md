# Scrap vehicle and used auto parts platform

This repository is organized into the requested application areas:

- `frontend/` — React, TypeScript, Vite, and Tailwind CSS.
- `backend/` — Express REST API and PostgreSQL integration.
- `data/` — PostgreSQL schema and database setup notes.

The starter deliberately contains no sample products, testimonials, business
contact details, or generated AI assessments. Configure real business data and
connect an AI provider before enabling those features.

## Requirements

- Node.js 20 or newer
- npm 10 or newer
- PostgreSQL for product listings and persistent records

## Supabase PostgreSQL setup

1. Create a project in the [Supabase Dashboard](https://supabase.com/dashboard).
   Wait for the database to finish provisioning.
2. In the project dashboard, open **Connect** (or **Project Settings →
   Database**) and copy a PostgreSQL connection string. For a long-running
   Express server, use the direct connection when the host supports IPv6, or
   Supabase's **Session pooler** connection string when it does not. Use the
   Transaction pooler only when appropriate for your hosting setup.
3. Copy `backend/.env.example` to `backend/.env`. Replace the connection URL
   placeholders with the exact values from Supabase; preserve
   `?sslmode=require`. URL-encode special characters in the database password.
   Keep this file private: never put this URL, a database password, or a
   Supabase service-role key in frontend environment variables or source.
4. Apply `data/migrations/001_initial_schema.sql` once to the project's
   PostgreSQL database. You can run it in the Supabase SQL Editor using a
   database-owner account, or use the Supabase CLI/migration workflow. This
   schema creates tables only; it inserts no example products or business data.
5. From the repository root run `npm install`, then `npm run dev`. The backend
   starts on port 3001 by default. To run only the backend, use
   `npm run dev --workspace backend` from the repository root.
6. Verify connectivity by opening `http://localhost:3001/api/health` or running
   `Invoke-RestMethod http://localhost:3001/api/health` in PowerShell. A
   successful database check returns HTTP 200 with
   `database.status: "connected"` and `database.reachable: true`. If
   `DATABASE_URL` is unset or the connection fails, health returns HTTP 503
   with a safe status; available-products requests also return HTTP 503 and
   never substitute fabricated inventory.

The backend uses `pg` and the server-only `DATABASE_URL`. The pool uses a
connection timeout, emits sanitized connection diagnostics, and closes during
server shutdown. Supabase credentials are not required by—and must not be
configured in—the frontend.

## Run locally

For frontend and backend together, run `npm run dev` from the repository root.
Without a database URL, product listings return an explicit service-unavailable
error. No sample inventory is substituted.

## Phase 1 application structure

The React app contains routed public pages for home, parts catalogue, product
details, vehicle enquiries, sell guide, about, how it works, contact, FAQ,
privacy, terms, and not-found. English/Tamil copy covers primary navigation,
forms, and important service states. Admin routes have a separate shell, but
use server-verified authentication before protected admin operations are shown.
An administrator account must be provisioned in the backend environment.

The Express API is organized into routes, controllers, services, and Zod
validation. Implemented routes include health, available products with
parameterized search/category/make/model/condition/price/sort filters,
available product details, categories, and validated vehicle/contact enquiry
submissions. Enquiry submissions require database connectivity. Invalid input
gets a 400; unavailable storage gets a safe 503; no sample records are used.
The image-assessment status and file uploads are explicitly unavailable. Admin
authentication and product CRUD are implemented as described below. AI
assessment is not active.

### Administrator and image-storage status

Admin sign-in uses one backend-provisioned username and an scrypt password hash.
There is no public admin registration, default account, or plaintext password
storage. To provision an administrator locally:

1. From the repository root, run `npm run admin:hash-password --workspace
   backend` in an interactive terminal. Enter a unique password of at least 12
   characters when prompted; input is hidden. The command prints only an
   `ADMIN_PASSWORD_HASH=scrypt$...` line.
2. Add `ADMIN_USERNAME`, that hash as `ADMIN_PASSWORD_HASH`, and a
   cryptographically random `ADMIN_SESSION_SECRET` (at least 32 bytes) to the
   private `backend/.env`. Keep `.env` out of source control; never put these
   values in frontend variables. For example, generate a session secret locally
   with Node's `crypto.randomBytes(48).toString("base64url")`.
3. Set `FRONTEND_ORIGIN` to the exact browser origin that serves the frontend.
   The API checks the `Origin` header for login, logout, and mutations and uses
   credentialed CORS for that single configured origin. The session cookie is
   HttpOnly, signed, expires after eight hours, and is `Secure; SameSite=None`
   in production; production must therefore be served over HTTPS. Admin requests
   also require a valid cookie on the backend; the frontend route is not the
   security boundary.

The backend exposes `GET /api/auth/session`, `POST /api/auth/login`, and
`POST /api/auth/logout`. Login attempts are rate limited, passwords are checked
with scrypt and constant-time hash comparison, and authentication failures
return safe responses. If the account variables or session secret are missing
or invalid, sign-in returns HTTP 503 and no admin session is issued.

Authenticated admin product APIs are:

- `GET /api/admin/products` — paged/searchable product inventory, including
  inactive and out-of-stock products.
- `GET /api/admin/products/:id` and `GET /api/admin/vehicle-models`.
- `POST /api/admin/products` and `PUT /api/admin/products/:id` — validated
  writes in database transactions, including category, condition, price,
  quantity, publication state, supported vehicle model IDs, and image URLs.
- `DELETE /api/admin/products/:id` — archives by setting `is_active = FALSE`;
  it does not delete the product row.

Mutations use parameterized SQL and validate references against the existing
`product_categories` and `vehicle_models` tables. Fixed-price products require
an explicit non-negative price; stock must be a non-negative integer.
Compatibility is persisted only against existing model IDs, with an explicit
verified/unverified status. Product/image/compatibility changes and audit-log
entries use the existing checked-in schema; private image records are retained
when public image URLs are replaced. No schema was added or changed for this
implementation. The database must already have the existing tables from
`data/migrations/001_initial_schema.sql`; no migration, remote database
connection, or production-data write was performed as part of this task.
The current environment-provisioned administrator is not linked to a `profiles`
row, so `audit_logs.actor_id` remains NULL; audit entries record product action
and entity only. A multi-admin identity store and actor linkage require a
deliberate authentication/schema design before provisioning more accounts.

The existing `product_images.storage_path` column supports saving externally
hosted HTTP(S) image URLs as public image paths. These URLs are references only;
the app does not download or host the image. Local file selection supports
preview and type/size checks but upload remains unavailable because no
persistent object-storage provider is configured. The upload endpoint continues
to return HTTP 503 and never claims a file was saved.

After a successful product mutation, the admin UI refreshes the inventory and
notifies open storefront catalogue/detail views to refetch the existing public
API. Public routes retain their current publication rule: active products with
positive available quantity only. A successful API write is not evidence of
remote database connectivity; actual persistence depends on `DATABASE_URL`
being valid and the existing schema being present.

The Vite dev server proxies `/api` to `http://localhost:3001`. If the deployed
frontend and backend use separate origins, set `VITE_API_BASE_URL` at frontend
build time to the backend API origin. Never put database credentials,
Supabase service-role keys, or AI provider keys in frontend variables.

For optional product-detail WhatsApp links, copy `frontend/.env.example` to
`frontend/.env.local` and set `VITE_WHATSAPP_NUMBER` to the business's public
number in international format. This is public contact information and is
embedded in the frontend build; do not put secrets in it. The link is omitted
when no valid number is configured.

## Reference-catalogue assistant

The public website includes an assistant at `/assistant`, backed by
`POST /api/assistant`. It searches only the source-traceable reference
catalogue at `data/reference-catalogue.json`; these records are not marketplace
inventory. The catalogue currently has no entries because the two source PDFs
were not present in the project or available workspace during implementation.
Do not add guessed models, parts, fitment, or prices. Provide
`old_bike_models_2001_2017.pdf` and `bike_spare_parts_rate_list.pdf` so the
entries and the PDFs' scope/compatibility warnings can be verified.

The assistant accepts any backend-side provider implementing the
OpenAI-compatible Chat Completions API and JSON-object response format. The
following settings are required in `backend/.env` for provider requests:

```dotenv
AI_API_URL=https://api.openai.com/v1/chat/completions
AI_API_KEY=your_provider_api_key
AI_MODEL=your_provider_model
REFERENCE_CATALOGUE_PATH=../data/reference-catalogue.json
```

OpenAI is shown as a compatible endpoint example, not a requirement; compatible
providers may have their own access terms or costs. HTTPS is required for
remote providers (HTTP is accepted only for a loopback development endpoint).
Keep the key in `backend/.env`, never in a `VITE_*` variable, frontend bundle,
chat message, or source-control commit. The endpoint also works safely without
provider configuration and returns HTTP 503; it does not simulate AI output.
An empty or invalid catalogue likewise cannot produce model/part results.

The assistant reports only model and part records whose IDs are present in the
validated reference catalogue. Its explanatory reply is generated from those
records by the backend, not copied from free-form provider text. It does not
claim verified compatibility, current stock, price, or availability. No live
provider request has been verified unless the provider is configured and a
real request is explicitly tested.

Apply `data/migrations/002_enquiry_form_fields.sql` only after checking that it
has not already been applied. No migrations or database queries are run as part
of this phase. See [data/SCHEMA_PLAN.md](./data/SCHEMA_PLAN.md) before making
database changes.

## Development and checks

From the repository root:

- `npm run dev` starts frontend and backend workspaces.
- `npm run build` builds both applications.
- `npm run typecheck` type-checks both workspaces.
- `npm test --workspace backend` runs backend request-validation tests.

For backend-only development, use `npm run dev --workspace backend`. Until
Supabase connectivity is verified, database-dependent catalogue and enquiry
operations display safe unavailable states. No metrics or AI findings are
fabricated.
