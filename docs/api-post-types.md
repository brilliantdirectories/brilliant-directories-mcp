# BD API — Post Types (Data Categories) Endpoints
_Source: https://support.brilliantdirectories.com/support/solutions/articles/12000108054_

## Endpoints

### 1. List Post Types
`GET /api/v2/data_categories/get`

Filter by `data_active=1` to get active post types only.

### 2. Get Single Post Type
`GET /api/v2/data_categories/get/{data_id}`

### 3. Create Post Type — NOT EXPOSED VIA THIS MCP

Creating new post types is admin-panel work, not a common agent operation. The endpoint exists on BD's side (`POST /api/v2/data_categories/create`) but has been intentionally removed from this MCP server's tool list as of v5.4.0 to keep agent tool-discovery focused on member/content workflows. Configure new post types in BD admin → Website Design → Post Types, then use `listPostTypes` to discover their IDs.

### 4. Get Custom Fields for Post Type
`POST /api/v2/data_categories/custom_fields`

**Required:** `data_id`

Returns the custom fields configured for a specific post type form.

### 5. Update Post Type
`PUT /api/v2/data_categories/update`

**Required:** `data_id`
**Optional:** `category_tab`, `per_page`, any post type field

### 6. Delete Post Type
`DELETE /api/v2/data_categories/delete`

**Required:** `data_id`
