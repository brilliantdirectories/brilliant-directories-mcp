# BD API — User Services (Rel Services) Endpoints
_Source: https://support.brilliantdirectories.com/support/solutions/articles/12000108071_

Links between users/members and services. Tracks which services a member offers, with pricing and specialty flags.

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
