# BD API — Unsubscribe List Endpoints
_Source: https://support.brilliantdirectories.com/support/solutions/articles/12000108055_

**Related support articles:**
- https://support.brilliantdirectories.com/support/solutions/articles/12000102546 (Unsubscribe API)

## Endpoints

### 1. List Unsubscribe Records
`GET /api/v2/unsubscribe_list/get`

Supports pagination.

### 2. Get Single Unsubscribe Record
`GET /api/v2/unsubscribe_list/get/{id}`

### 3. Create Unsubscribe Record
`POST /api/v2/unsubscribe_list/create`

**Required:** `email`
**Optional:** `definitive` (1=permanent unsubscribe, 0=standard)

**Note:** `date`, `code`, and `website_id` are set automatically.

### 4. Update Unsubscribe Record
`PUT /api/v2/unsubscribe_list/update`

**Required:** `id`
**Optional:** `definitive`

### 5. Delete Unsubscribe Record
`DELETE /api/v2/unsubscribe_list/delete`

**Required:** `id`

Removes email from unsubscribe list, re-enabling emails to that address.
