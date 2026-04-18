# BD API — Services (Sub-Categories) Endpoints
_Source: https://support.brilliantdirectories.com/support/solutions/articles/12000108122_

Services are **sub-categories** under a parent Category (profession). Stored in `list_services`. Used for finer-grained taxonomy (e.g., Category = "Restaurants" → Services = "Sushi", "Italian", "Thai").

## How Services fit into the taxonomy

- Each service has a `profession_id` — the parent Category (top-level). A service without a valid `profession_id` is orphaned.
- `master_id` allows sub-sub-categories (a service nested under another service). Set to `0` for standard sub-categories directly under a category.
- Members are associated with services via the `services` field on the user record (CSV of service IDs), OR via a dedicated join row in `rel_services` (see `UserService` endpoints for pricing/specialty/date tracking).
- **Create a top-level Category first** via `createCategory`, THEN create services under it. See `docs/api-categories.md` for the full taxonomy model + end-to-end example.

## Endpoints

### 1. List Services
`GET /api/v2/list_services/get`

Supports pagination. Returns `service_id`, `name`, `desc`, `profession_id` (parent category), `master_id`, `filename` (URL slug), `keywords`, `revision_timestamp`, `sort_order`, `lead_price`, `image`.

### 2. Get Single Service
`GET /api/v2/list_services/get/{service_id}`

### 3. Create Service
`POST /api/v2/list_services/create`

**Required:** `name`, `profession_id`
**Optional:** `desc`, `filename`, `keywords`, `sort_order`, `lead_price`, `master_id`

### 4. Update Service
`PUT /api/v2/list_services/update`

**Required:** `service_id`
**Optional:** `name`, `desc`, `profession_id`, `filename`, `keywords`, `sort_order`, `lead_price`, `master_id`

### 5. Delete Service
`DELETE /api/v2/list_services/delete`

**Required:** `service_id`
