# BD API — Category Groups Endpoints
_Source: https://support.brilliantdirectories.com/support/solutions/articles/12000108058_

Groups that organize categories (professions) into top-level buckets.

## Endpoints

### 1. List Category Groups
`GET /api/v2/category_group/get`

Supports pagination. Returns `group_id`, `group_name`, `group_filename`, `group_desc`, `database`.

### 2. Get Single Category Group
`GET /api/v2/category_group/get/{group_id}`

### 3. Create Category Group
`POST /api/v2/category_group/create`

**Required:** `group_name`, `group_filename`, `database`
**Optional:** `group_desc`

### 4. Update Category Group
`PUT /api/v2/category_group/update`

**Required:** `group_id`
**Optional:** `group_name`, `group_desc`

### 5. Delete Category Group
`DELETE /api/v2/category_group/delete`

**Required:** `group_id`
