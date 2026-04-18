# BD API — Widgets Endpoints
_Source: https://support.brilliantdirectories.com/support/solutions/articles/12000108056_

## Endpoints

### 1. List Widgets
`GET /api/v2/data_widgets/get`

Supports pagination.

### 2. Get Single Widget
`GET /api/v2/data_widgets/get/{widget_id}`

### 3. Create Widget
`POST /api/v2/data_widgets/create`

**Required:** `widget_name`
**Optional:** `widget_data` (HTML content), `widget_viewport` (front/admin/both), `bootstrap_enabled` (0/1)

### 4. Update Widget
`PUT /api/v2/data_widgets/update`

**Required:** `widget_id`
**Optional:** `widget_name`, `widget_data`

### 5. Delete Widget
`DELETE /api/v2/data_widgets/delete`

**Required:** `widget_id`

### 6. Render Widget
`POST /api/v2/data_widgets/render`

**Required:** `widget_id`

Returns rendered HTML output with all template variables processed. Useful for previewing or embedding in external apps.

**Response:** `{ "status": "success", "message": "Widget rendered successfully", "name": "My Widget Name", "output": "<h2>Welcome!</h2>" }`
