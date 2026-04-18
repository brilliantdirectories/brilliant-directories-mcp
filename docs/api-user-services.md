# BD API — User Services (Rel Services) Endpoints
_Source: https://support.brilliantdirectories.com/support/solutions/articles/12000108071_

Links between users (members) and Services (sub-categories). Tracks which services a member offers, with per-service pricing and specialty flags. Stored in `rel_services`.

## When to use this vs. the user's `services` field

BD offers two ways to associate a member with services — use the right one for the use case:

- **`user.services` field (CSV of service IDs) on `createUser`/`updateUser`** — simplest; use when you just need "this member offers these services" with no per-service metadata. Good for bulk imports, quick taxonomy assignment.
- **`createUserService` (this resource)** — adds a full join-table row with per-service `avg_price`, `specialty` flag, `num_completed` counter, and `date`. Use when the site tracks price-per-service, completion counts, or specialty designations.

Both can coexist. The canonical taxonomy model lives in `docs/api-categories.md` — read that first if you're building categories/services from scratch.

## Endpoints

### 1. List User Services
`GET /api/v2/rel_services/get`

Supports pagination. Returns `rel_id`, `user_id`, `service_id`, `date`, `avg_price`, `num_completed`, `specialty`.

### 2. Get Single User Service
`GET /api/v2/rel_services/get/{rel_id}`

### 3. Create User Service
`POST /api/v2/rel_services/create`

**Required:** `user_id`, `service_id`
**Optional:** `date` (YYYYMMDDHHmmss), `avg_price` (decimal), `specialty` (0/1)

### 4. Update User Service
`PUT /api/v2/rel_services/update`

**Required:** `rel_id`
**Optional:** `avg_price`, `specialty`, `num_completed`, `date`

### 5. Delete User Service
`DELETE /api/v2/rel_services/delete`

**Required:** `rel_id`
