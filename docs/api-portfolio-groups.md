# BD API — Multi Image Posts (Album Groups) Endpoints
_Source: https://support.brilliantdirectories.com/support/solutions/articles/12000108051_

## Endpoints

### 1. List Album Groups
`GET /api/v2/users_portfolio_groups/get`

Supports pagination + filtering.

### 2. Get Single Album Group
`GET /api/v2/users_portfolio_groups/get/{group_id}`

### 3. Create Album Group
`POST /api/v2/users_portfolio_groups/create`

**Required:** `user_id`, `data_id` (post type category ID), `data_type` (from `data_categories/get`)
**Optional:** `group_name`, `group_desc`, `group_status` (0=Hidden, 1=Published)

### 4. Update Album Group
`PUT /api/v2/users_portfolio_groups/update`

**Required:** `group_id`
**Optional:** `group_name`, any album group field

### 5. Delete Album Group
`DELETE /api/v2/users_portfolio_groups/delete`

**Required:** `group_id`

### 6. Search Album Groups
`POST /api/v2/users_portfolio_groups/search`

**Optional:** `q` (keyword), `data_id` (post type category)

### Field Discovery
`GET /api/v2/users_portfolio_groups/fields?form_name={form-name}`

Pass `form_name` for custom fields specific to that post type. 45+ fields available.
