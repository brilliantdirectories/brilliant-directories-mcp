# BD API — Multi-Image Posts Endpoints

**Tools:** `listMultiImagePosts`, `getMultiImagePost`, `createMultiImagePost`, `updateMultiImagePost`, `deleteMultiImagePost`, `getMultiImagePostFields`
**Underlying endpoint:** `/api/v2/users_portfolio_groups/*`
**BD table:** `users_portfolio_groups`
**Primary key:** `group_id`

**Related support articles:**
- https://support.brilliantdirectories.com/support/solutions/articles/12000108051 (Multi Image Posts / Album Groups reference — primary source)
- https://support.brilliantdirectories.com/support/solutions/articles/12000093239 (Member Posts API — confirms `auto_image_import` support across both post families)

Multi-Image Posts are the family of post types that render with multiple images per record — photo albums, galleries, property listings with multiple photos, product catalogs, classifieds with multi-photo support, etc. Backed by the `users_portfolio_groups` table. Individual photos within a Multi-Image Post are managed separately via `MultiImagePostPhoto` tools.

## Choosing this endpoint vs. Single-Image Posts

BD splits post types into two families based on the post type's `data_type` classification. Look up the target post type's `data_type` via `listPostTypes` or `getPostType` first:

| `data_type` | Family | Use endpoint |
|---|---|---|
| `4` | Multi-image (albums, galleries, photo-heavy listings — e.g. Photo Album, Classified, Property, Product) | `createMultiImagePost` (this) |
| `9`, `20` | Single-image families | `createSingleImagePost` (different endpoint) |
| `10`, `13`, `21`, `29` | Internal admin types | Use the resource-specific endpoint instead |

## Endpoints

### List Multi-Image Posts
`GET /api/v2/users_portfolio_groups/get` — paginated + filterable.

### Get Single
`GET /api/v2/users_portfolio_groups/get/{group_id}`

### Create Multi-Image Post
`POST /api/v2/users_portfolio_groups/create`
- **Required:** `user_id`, `data_id` (post type ID from `listPostTypes`), `data_type` (must correspond to a multi-image family — usually `4`)
- **Optional:** `group_name`, `group_desc`, `group_status` (`0`=Hidden, `1`=Published), `auto_image_import` (recommended `1` when supplying external image URLs)
- Response includes `group_id` — use this to add photos via `createMultiImagePostPhoto`

### Update
`PUT /api/v2/users_portfolio_groups/update`
- **Required:** `group_id`

### Delete
`DELETE /api/v2/users_portfolio_groups/delete`
- **Required:** `group_id`
- **Caution:** any photos in this Multi-Image Post (rows in `users_portfolio` with matching `group_id`) become orphaned — delete or reassign them first.

### Search
`POST /api/v2/users_portfolio_groups/search`
- **Optional:** `q` (keyword), `data_id` (scope to one post type)

### Field Discovery
`GET /api/v2/users_portfolio_groups/fields?form_name={form-name}` — 45+ fields available depending on post type configuration.

## Workflow — full multi-image post with photos

```
1. listPostTypes → find a post type with data_type=4 (e.g. data_id=10 "Photo Album")
2. createMultiImagePost(user_id=X, data_id=10, data_type=4, group_name="My Album",
                        auto_image_import=1) → returns group_id=42
3. createMultiImagePostPhoto(user_id=X, group_id=42,
                             original_image_url="https://source.com/pic1.jpg") → photo 1
4. createMultiImagePostPhoto(user_id=X, group_id=42,
                             original_image_url="https://source.com/pic2.jpg") → photo 2
5. ...repeat for each photo
```

## Auto-image-import rule

Same as Single-Image Posts: when supplying external image URLs for this album's feature image or any photo URL, include `auto_image_import=1` to have BD fetch and store them locally. Default when scraping or migrating from external sources.
