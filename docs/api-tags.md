# BD API — Tags Endpoints
_Source: https://support.brilliantdirectories.com/support/solutions/articles/12000108059_

Tags for categorizing and labeling content.

## Endpoints

### 1. List Tags
`GET /api/v2/tags/get`

Supports pagination. Returns `id`, `tag_name`, `group_tag_id`, `added_by`.

### 2. Get Single Tag
`GET /api/v2/tags/get/{id}`

### 3. Create Tag
`POST /api/v2/tags/create`

**Required:** `tag_name`, `group_tag_id`, `added_by` (user ID)

### 4. Update Tag
`PUT /api/v2/tags/update`

**Required:** `id`
**Optional:** `tag_name`

### 5. Delete Tag
`DELETE /api/v2/tags/delete`

**Required:** `id`
