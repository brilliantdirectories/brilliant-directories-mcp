# BD API — Tag Relationships (Rel Tags) Endpoints
_Source: https://support.brilliantdirectories.com/support/solutions/articles/12000108062_

Links tags to objects (users, posts, etc.) via a polymorphic relationship.

## Endpoints

### 1. List Tag Relationships
`GET /api/v2/rel_tags/get`

Supports pagination. Returns `id`, `tag_id`, `object_id`, `tag_type_id`, `added_by`, `created_at`.

### 2. Get Single Tag Relationship
`GET /api/v2/rel_tags/get/{id}`

### 3. Create Tag Relationship
`POST /api/v2/rel_tags/create`

**Required:** `tag_id`, `object_id`, `tag_type_id`, `added_by`

### 4. Update Tag Relationship
`PUT /api/v2/rel_tags/update`

**Required:** `id`
**Optional:** `object_id`

### 5. Delete Tag Relationship
`DELETE /api/v2/rel_tags/delete`

**Required:** `id`
