# BD API — Album Photos Endpoints
_Source: https://support.brilliantdirectories.com/support/solutions/articles/12000108052_

## Endpoints

### 1. List Album Photos
`GET /api/v2/users_portfolio/get`

Filter by `group_id` to get all photos in an album.

### 2. Get Single Photo
`GET /api/v2/users_portfolio/get/{photo_id}`

### 3. Create Photo
`POST /api/v2/users_portfolio/create`

**Required:** `user_id`, `group_id`
**Optional:** `title`, `original_image_url`, `status` (0=Hidden, 1=Active)

### 4. Update Photo
`PUT /api/v2/users_portfolio/update`

**Required:** `photo_id`
**Optional:** `title`, `order` (display position in album)

### 5. Delete Photo
`DELETE /api/v2/users_portfolio/delete`

**Required:** `photo_id`

**Note:** No search endpoint for photos — use list with `group_id` filter instead.
