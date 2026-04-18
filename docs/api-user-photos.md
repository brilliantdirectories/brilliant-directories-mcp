# BD API — User Photos Endpoints
_Source: https://support.brilliantdirectories.com/support/solutions/articles/12000108065_

Member profile photos — logos, photos, and cover photos.

## Endpoints

### 1. List User Photos
`GET /api/v2/users_photo/get`

Supports pagination. Returns `photo_id`, `user_id`, `file`, `type`, `date_added`.

### 2. Get Single User Photo
`GET /api/v2/users_photo/get/{photo_id}`

### 3. Create User Photo
`POST /api/v2/users_photo/create`

**Required:** `user_id`, `file` (image filename), `type` (logo/photo/cover_photo)
**Optional:** `date_added` (YYYYMMDDHHmmss)

### 4. Update User Photo
`PUT /api/v2/users_photo/update`

**Required:** `photo_id`
**Optional:** `type`

### 5. Delete User Photo
`DELETE /api/v2/users_photo/delete`

**Required:** `photo_id`
