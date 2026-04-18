# BD API — Menus Endpoints
_Source: https://support.brilliantdirectories.com/support/solutions/articles/12000108110_

Menu containers — menu items managed separately via Menu Items endpoint.

## Endpoints

### 1. List Menus
`GET /api/v2/menus/get`

Supports pagination. Returns `menu_id`, `menu_name`, `menu_title`, `menu_location`, `menu_active`, `menu_div_id`, `menu_div_class`, `menu_div_css`, `menu_div_code`, `menu_effects`.

### 2. Get Single Menu
`GET /api/v2/menus/get/{menu_id}`

### 3. Create Menu
`POST /api/v2/menus/create`

**Required:** `menu_name` (max 35 chars), `menu_title`
**Optional:** `menu_location`, `menu_div_id` (max 60), `menu_div_class` (max 60), `menu_div_css`, `menu_div_code`, `menu_effects` (max 60), `menu_active` (0/1)

### 4. Update Menu
`PUT /api/v2/menus/update`

**Required:** `menu_id`
**Optional:** Any menu field

### 5. Delete Menu
`DELETE /api/v2/menus/delete`

**Required:** `menu_id`
