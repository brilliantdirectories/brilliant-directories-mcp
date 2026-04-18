# BD API — Multi-Image Post Photos Endpoints

**Tools:** `listMultiImagePostPhotos`, `getMultiImagePostPhoto`, `createMultiImagePostPhoto`, `updateMultiImagePostPhoto`, `deleteMultiImagePostPhoto`
**Underlying endpoint:** `/api/v2/users_portfolio/*`
**BD table:** `users_portfolio`
**Primary key:** `photo_id`

**Related support articles:**
- https://support.brilliantdirectories.com/support/solutions/articles/12000108052 (primary source)
- https://support.brilliantdirectories.com/support/solutions/articles/12000093239 (Member Posts API — covers both post families and their image-handling)

Individual photos within a Multi-Image Post. Each photo belongs to a parent Multi-Image Post (`group_id`) owned by a member (`user_id`). Added AFTER the parent Multi-Image Post has been created via `createMultiImagePost`.

## Endpoints

### List Photos
`GET /api/v2/users_portfolio/get` — filter by `group_id` to get all photos in one Multi-Image Post.

### Get Single Photo
`GET /api/v2/users_portfolio/get/{photo_id}`

### Create Photo
`POST /api/v2/users_portfolio/create`
- **Required:** `user_id`, `group_id` (parent Multi-Image Post from `createMultiImagePost`)
- **Optional:** `title`, `original_image_url` (full URL of the image — must be publicly accessible when BD fetches it), `status` (`0`=Hidden, `1`=Active)

### Update Photo
`PUT /api/v2/users_portfolio/update`
- **Required:** `photo_id`
- **Optional:** `title`, `order` (display position within the album)

### Delete Photo
`DELETE /api/v2/users_portfolio/delete`
- **Required:** `photo_id`

**Note:** No dedicated search endpoint — use `listMultiImagePostPhotos` with the `group_id` filter instead.

## Typical flow

```
1. createMultiImagePost → returns group_id
2. For each image URL:
   createMultiImagePostPhoto with user_id, group_id, original_image_url
```
