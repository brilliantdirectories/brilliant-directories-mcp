# BD API — Menu Items Endpoints
_Source: https://support.brilliantdirectories.com/support/solutions/articles/12000108111_

Individual menu items within a menu container.

## Endpoints

### 1. List Menu Items
`GET /api/v2/menu_items/get`

Supports pagination. Returns `menu_item_id`, `menu_id`, `menu_name`, `menu_link`, `master_id` (parent item), `menu_order`, `menu_active`, `menu_target`, `menu_class`, `menu_icon`.

### 2. Get Single Menu Item
`GET /api/v2/menu_items/get/{menu_item_id}`

### 3. Create Menu Item
`POST /api/v2/menu_items/create`

**Required:** `menu_id` (parent menu), `menu_name` (display text), `menu_link` (URL/path), `master_id` (0 for top-level, parent item ID for sub-item), `menu_order`
**Optional:** `menu_active` (0/1), `menu_target` (_blank/_self), `menu_class` (CSS classes), `menu_icon` (icon class)

### 4. Update Menu Item
`PUT /api/v2/menu_items/update`

**Required:** `menu_item_id`
**Optional:** Any menu item field

### 5. Delete Menu Item
`DELETE /api/v2/menu_items/delete`

**Required:** `menu_item_id`
