# BD API — Tag Types Endpoints
_Source: https://support.brilliantdirectories.com/support/solutions/articles/12000108061_

Defines types of tags and their database table relationships.

## Endpoints

### 1. List Tag Types
`GET /api/v2/tag_types/get`

Supports pagination. Returns `id`, `type_name`, `table_relation`.

### 2. Get Single Tag Type
`GET /api/v2/tag_types/get/{id}`

### 3. Create Tag Type
`POST /api/v2/tag_types/create`

**Required:** `type_name`, `table_relation`

### 4. Update Tag Type
`PUT /api/v2/tag_types/update`

**Required:** `id`
**Optional:** `type_name`

### 5. Delete Tag Type
`DELETE /api/v2/tag_types/delete`

**Required:** `id`
