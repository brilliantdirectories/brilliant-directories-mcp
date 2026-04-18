# BD API — Categories (Professions) Endpoints
_Source: https://support.brilliantdirectories.com/support/solutions/articles/12000108057_

Categories (internally called "professions") — the primary taxonomy for organizing members and content.

## Endpoints

### 1. List Categories
`GET /api/v2/category/get`

Supports pagination. Returns `category_id`, `name`, `group_id`, `filename`, `icon`, `keywords`, `revision_timestamp`, `json_meta`.

### 2. Get Single Category
`GET /api/v2/category/get/{category_id}`

### 3. Create Category
`POST /api/v2/category/create`

**Required:** `name`, `filename`, `group_id`
**Optional:** `keywords`, `icon`

### 4. Update Category
`PUT /api/v2/category/update`

**Required:** `category_id`
**Optional:** `name`, `filename`, `group_id`, `keywords`, `icon`

### 5. Delete Category
`DELETE /api/v2/category/delete`

**Required:** `category_id`
