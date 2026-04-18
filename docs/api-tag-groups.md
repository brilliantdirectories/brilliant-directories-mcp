# BD API — Tag Groups Endpoints
_Source: https://support.brilliantdirectories.com/support/solutions/articles/12000108060_

Groups that organize tags into collections.

## Endpoints

### 1. List Tag Groups
`GET /api/v2/tag_groups/get`

Supports pagination. Returns `id`, `group_tag_name`, `added_by`, `updated_by`.

### 2. Get Single Tag Group
`GET /api/v2/tag_groups/get/{id}`

### 3. Create Tag Group
`POST /api/v2/tag_groups/create`

**Required:** `group_tag_name`, `added_by` (user ID), `updated_by` (user ID)

### 4. Update Tag Group
`PUT /api/v2/tag_groups/update`

**Required:** `id`
**Optional:** `group_tag_name`

### 5. Delete Tag Group
`DELETE /api/v2/tag_groups/delete`

**Required:** `id`
