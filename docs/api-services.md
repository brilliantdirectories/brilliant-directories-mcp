# BD API — Sub Categories (Services) Endpoints

**Tools:** `listSubCategories`, `getSubCategory`, `createSubCategory`, `updateSubCategory`, `deleteSubCategory`
**Underlying endpoint:** `/api/v2/list_services/*`
**BD table:** `list_services`
**Primary key:** `service_id`

_Source: https://support.brilliantdirectories.com/support/solutions/articles/12000108122_

Sub Categories are LEVEL 2 of BD's 3-tier member classification (e.g., "Sushi" under "Restaurants"). Each has a `profession_id` pointing at its parent Top Category.

**Sub-sub-categories** (level 3 nesting) are also Sub Categories but with `master_id` set to the parent Sub Category's `service_id`. `master_id=0` (default) means "directly under the Top Category."

## Relationship to other resources

- **Parent:** Top Category (via `profession_id`). See `docs/api-categories.md` for the full hierarchy model.
- **Children:** other Sub Categories with `master_id` = this one's `service_id` (sub-sub-nesting).
- **Members tagged:** either via `users_data.services` CSV field (simpler) or via `rel_services` join rows (with per-link metadata). See `docs/api-user-services.md`.

## Endpoints

### List Sub Categories
`GET /api/v2/list_services/get` — paginated. Filter by `profession_id` to get Sub Categories under one specific Top.

### Get Single Sub Category
`GET /api/v2/list_services/get/{service_id}`

### Create Sub Category
`POST /api/v2/list_services/create`
- **Required:** `name`, `profession_id`
- **Optional:** `desc`, `filename`, `keywords`, `sort_order`, `lead_price`, `master_id` (for sub-sub nesting; default 0 = direct child of Top)

### Update Sub Category
`PUT /api/v2/list_services/update`
- **Required:** `service_id`
- **Optional:** any field
- Changing `profession_id` moves this Sub Category under a different Top Category
- Changing `master_id` re-nests it (non-zero) or flattens to direct-under-Top (0)

### Delete Sub Category
`DELETE /api/v2/list_services/delete`
- **Required:** `service_id`
- **Caution:** orphan risk — any member with this `service_id` in their CSV, and any `rel_services` rows pointing at it, become stranded.

## Schema

| Field | Type | Description |
|---|---|---|
| `service_id` | integer | Primary key (read-only) |
| `name` | string | Display name |
| `desc` | text | Description |
| `profession_id` | integer | Parent Top Category ID (required link) |
| `master_id` | integer | Parent Sub Category ID for sub-sub nesting; 0 = directly under Top |
| `filename` | string | URL slug |
| `keywords` | text | SEO keywords |
| `sort_order` | integer | Display order within parent |
| `lead_price` | decimal | Per-lead price for this Sub Category |
| `image` | string | Image filename |
| `revision_timestamp` | timestamp | Last modified |
