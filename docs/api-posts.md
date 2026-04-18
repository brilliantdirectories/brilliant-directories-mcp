# BD API — Single-Image Posts Endpoints

**Tools:** `listSingleImagePosts`, `getSingleImagePost`, `createSingleImagePost`, `updateSingleImagePost`, `deleteSingleImagePost`, `searchSingleImagePosts`, `getSingleImagePostFields`
**Underlying endpoint:** `/api/v2/data_posts/*`
**BD table:** `data_posts`
**Primary key:** `post_id`

**Related support articles:**
- https://support.brilliantdirectories.com/support/solutions/articles/12000108050 (Data Posts reference — primary source)
- https://support.brilliantdirectories.com/support/solutions/articles/12000093239 (Member Posts API — confirms `auto_image_import` support across both post families)

Single-Image Posts are the family of post types that render with one feature image per record — articles, events, jobs, coupons, videos, blog posts, discussions, etc. Backed by the `data_posts` table.

## Choosing this endpoint vs. Multi-Image Posts

BD splits post types into two families based on the post type's `data_type` classification. Look up the target post type's `data_type` via `listPostTypes` or `getPostType` first:

| `data_type` | Family | Use endpoint |
|---|---|---|
| `9` | Single-image video | `createSingleImagePost` (this) |
| `20` | Single-image article / event / blog / job / coupon | `createSingleImagePost` (this) |
| `4` | Multi-image (albums / galleries) | `createMultiImagePost` (different endpoint) |
| `10`, `13`, `21`, `29` | Internal admin types (Member Listings, Reviews, Specialties, Favorites) | Use the resource-specific endpoint instead |

If you call this endpoint with a multi-image `data_type=4` post type, BD may accept the write but the post won't render correctly on the public site.

## Endpoints

### List Single-Image Posts
`GET /api/v2/data_posts/get` — paginated + filterable. Filter by `user_id` to get a member's posts, or by `data_id` to scope to one post type.

### Get Single Post
`GET /api/v2/data_posts/get/{post_id}`

### Create Single-Image Post
`POST /api/v2/data_posts/create`
- **Required:** `user_id`, `data_id` (post type ID from `listPostTypes`), `data_type`
- **Optional:** `post_title`, `post_caption`, `post_content` (HTML allowed), `post_status` (0=Draft, 1=Published), `post_price`, `auto_image_import` (recommended `1` when supplying external image URLs)
- Response includes: `post_id`, `post_token`

### Update Single-Image Post
`PUT /api/v2/data_posts/update`
- **Required:** `post_id`

### Delete Single-Image Post
`DELETE /api/v2/data_posts/delete`
- **Required:** `post_id`

### Search Single-Image Posts
`POST /api/v2/data_posts/search`
- **Optional:** `q`, `category`, `data_id`, `user_id`, `page`, `limit`
- Pass `data_id` to scope search to a specific post type

### Field Discovery
`GET /api/v2/data_posts/fields?form_name={form-name}` — custom fields for a specific post type form

## Auto-image-import rule

When creating or updating a post with external image URLs (from a web-scrape, external CDN, CSV migration, etc.), set `auto_image_import=1`. BD will asynchronously fetch those URLs and store the images locally — without the flag, BD stores the external URL as-is and images break if the source host goes down. Default this to `1` unless the user explicitly wants to keep external URL references.
