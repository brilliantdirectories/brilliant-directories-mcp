# BD API — Top Categories (Professions) Endpoints

**Tools:** `listTopCategories`, `getTopCategory`, `createTopCategory`, `updateTopCategory`, `deleteTopCategory`
**Underlying endpoint:** `/api/v2/list_professions/*`
**BD table:** `list_professions`
**Primary key:** `profession_id`

_Source: https://support.brilliantdirectories.com/support/solutions/articles/12000108057_

Top Categories are LEVEL 1 of BD's 3-tier member classification (e.g., "Restaurants", "Dentists"). Each member's primary classification is a single Top Category, stored as `users_data.profession_id`.

## Member Category Hierarchy (full context)

| Level | MCP tool prefix | BD endpoint | BD table | PK | Parent link |
|---|---|---|---|---|---|
| 1. **Top Category** | `TopCategory` | `/api/v2/list_professions/*` | `list_professions` | `profession_id` | — |
| 2. **Sub Category** | `SubCategory` | `/api/v2/list_services/*` | `list_services` | `service_id` | `profession_id` → Top; `master_id` → parent SubCat (for sub-sub nesting, 0 = direct child of Top) |
| 3. **Member ↔ Sub Category link** | `MemberSubCategoryLink` | `/api/v2/rel_services/*` | `rel_services` | `rel_id` | `user_id` → member; `service_id` → SubCategory |

A member's classification on their public profile:
- `users_data.profession_id` → ONE Top Category (primary; appears in URL slug)
- `users_data.services` → CSV of SubCategory IDs (multiple allowed; simpler than the join table)
- `rel_services` rows → when you need per-link metadata (price, specialty, completion count)

## Full end-to-end example — "Create Restaurants → Sushi → assign Alice"

```
# Step 1: Create the Top Category
POST /api/v2/list_professions/create
  name=Restaurants
  filename=restaurants
→ returns { profession_id: 42, ... }

# Step 2: Create the Sub Category under it
POST /api/v2/list_services/create
  name=Sushi
  profession_id=42
  filename=sushi
→ returns { service_id: 17, ... }

# Step 3 — option A (simple): tag Alice via updateUser
PUT /api/v2/user/update
  user_id=<Alice>
  profession_id=42
  services=17

# Step 3 — option B (with metadata): use the join table
POST /api/v2/rel_services/create
  user_id=<Alice>
  service_id=17
  avg_price=29.99
  specialty=1
```

## Endpoints

### List Top Categories
`GET /api/v2/list_professions/get` — paginated; supports `property`/`property_value`/`property_operator` filtering.

### Get Single Top Category
`GET /api/v2/list_professions/get/{profession_id}`

### Create Top Category
`POST /api/v2/list_professions/create`
- **Required:** `name`, `filename`
- **Optional:** `desc`, `keywords`, `icon`, `sort_order`, `lead_price`, `image`

### Update Top Category
`PUT /api/v2/list_professions/update`
- **Required:** `profession_id`
- **Optional:** any field

### Delete Top Category
`DELETE /api/v2/list_professions/delete`
- **Required:** `profession_id`
- **Caution:** orphan risk — members referencing this `profession_id` and SubCategories with this as parent become stranded. Reassign or clean up first.

## Schema

| Field | Type | Description |
|---|---|---|
| `profession_id` | integer | Primary key (read-only) |
| `name` | string | Display name |
| `desc` | text | Long description |
| `filename` | string | URL-slug form (used in public profile URLs) |
| `keywords` | text | SEO keywords |
| `icon` | string | Icon identifier |
| `sort_order` | integer | Display order among Top Categories |
| `lead_price` | decimal | Per-lead price when a lead is matched to this category |
| `image` | string | Image filename for category banner/icon |
| `revision_timestamp` | timestamp | Last modified |
