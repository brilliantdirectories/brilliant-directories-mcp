# BD API — Services (Sub-Categories) Endpoints
_Source: https://support.brilliantdirectories.com/support/solutions/articles/12000108122_

Services are sub-categories under categories (professions). Used for finer-grained taxonomy.

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
