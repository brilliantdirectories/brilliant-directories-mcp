# BD API — User Metadata Endpoints
_Source: https://support.brilliantdirectories.com/support/solutions/articles/12000108063_

Key-value metadata attached to any database record. Used for custom fields and extended data.

## Endpoints

### 1. List User Metadata
`GET /api/v2/users_meta/get`

Supports pagination. Returns `meta_id`, `database`, `database_id`, `key`, `value`, `date_added`, `revision_timestamp`.

### 2. Get Single Metadata Record
`GET /api/v2/users_meta/get/{meta_id}`

### 3. Create Metadata Record
`POST /api/v2/users_meta/create`

**Required:** `database` (target table name), `database_id` (record ID in target table), `key`, `value`
**Optional:** `date_added` (YYYYMMDDHHmmss)

### 4. Update Metadata Record
`PUT /api/v2/users_meta/update`

**Required:** `meta_id`, `value`

### 5. Delete Metadata Record
`DELETE /api/v2/users_meta/delete`

**Required:** `meta_id`
