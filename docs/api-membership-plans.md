# BD API — Membership Plans (Subscription Types) Endpoints
_Source: https://support.brilliantdirectories.com/support/solutions/articles/12000108102_

## Endpoints

### 1. List Membership Plans
`GET /api/v2/subscription_types/get`

Supports pagination. Returns `subscription_id`, `subscription_name`, `subscription_type`, `monthly_amount`, `yearly_amount`, `profile_type` (paid/free/claim), `sub_active`, `searchable`.

### 2. Get Single Plan
`GET /api/v2/subscription_types/get/{subscription_id}`

### 3. Create Membership Plan
`POST /api/v2/subscription_types/create`

**Required:** `subscription_name`, `subscription_type` (member), `profile_type` (paid/free/claim)
**Optional:** `monthly_amount`, `yearly_amount`, `sub_active` (0/1), `searchable` (0/1), `search_priority`, `payment_default` (yearly/monthly), 50+ additional profile/feature fields

### 4. Update Membership Plan
`PUT /api/v2/subscription_types/update`

**Required:** `subscription_id`
**Optional:** Any plan field (e.g., `monthly_amount`, `yearly_amount`, `photo_limit`)

### 5. Delete Membership Plan
`DELETE /api/v2/subscription_types/delete`

**Required:** `subscription_id`
