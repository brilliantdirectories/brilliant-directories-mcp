# BD API — Data Posts (Single Image Posts) Endpoints
_Source: https://support.brilliantdirectories.com/support/solutions/articles/12000108050_

## Endpoints

### 1. List Posts
`GET /api/v2/data_posts/get`

Supports pagination + filtering. Filter by `user_id` to get a member's posts.

### 2. Get Single Post
`GET /api/v2/data_posts/get/{post_id}`

### 3. Create Post
`POST /api/v2/data_posts/create`

**Required:** `user_id`, `data_id` (post type category ID), `data_type` (data type classification)
**Optional:** `post_title`, `post_caption`, `post_content` (HTML allowed), `post_status` (0=Draft, 1=Published), `post_price`, additional fields from Post Object

**Response includes:** `post_id`, `post_token`

### 4. Update Post
`PUT /api/v2/data_posts/update`

**Required:** `post_id`
**Optional:** Any post field

### 5. Delete Post
`DELETE /api/v2/data_posts/delete`

**Required:** `post_id`

### 6. Search Posts
`POST /api/v2/data_posts/search`

**Optional:** `q` (keyword), `category`, `data_id` (post type — strongly recommended), `user_id`, `page`, `limit`

**Note:** Pass `data_id` to scope search to a specific post type. Results vary by post type configuration.

### Field Discovery
`GET /api/v2/data_posts/fields?form_name={form-name}`

Pass `form_name` to get custom fields for a specific post type.
