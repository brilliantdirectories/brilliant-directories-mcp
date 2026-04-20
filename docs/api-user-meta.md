# BD API — User Metadata (EAV) Endpoints
_Source: https://support.brilliantdirectories.com/support/solutions/articles/12000108063_

Despite the name, `users_meta` is a **generic EAV (Entity-Attribute-Value) key/value table** used across BD — NOT limited to user records. It stores arbitrary key/value pairs attached to any BD table row, keyed by `(database, database_id)`. Model: `users_meta`. DB table: `users_meta`.

Common use cases:

- Custom per-member attributes (`database=users_data`, `database_id=<user_id>`)
- Extended membership-plan attributes (`database=subscription_types`, `database_id=<subscription_id>`)
- **WebPage (list_seo) EAV-stored fields** — BD's `list_seo` table stores some fields directly on the record and others as `users_meta` rows. See "Critical workflow" below.

## Object fields

| Field | Type | Description |
|---|---|---|
| `meta_id` | integer | Primary key (read-only, server-assigned) |
| `database` | string | Target BD table name (e.g. `users_data`, `subscription_types`, `list_seo`) |
| `database_id` | integer | PK of the record in the target table |
| `key` | string | Metadata field name — must match the spelling the render/admin layer expects |
| `value` | text | Longtext; any string or serialized value |
| `date_added` | string | `YYYYMMDDHHmmss` (14-digit, no separators) |
| `revision_timestamp` | timestamp | Auto-managed by BD |

## Endpoints

### List — `GET /api/v2/users_meta/get`

Paginated enumeration. Supports standard `limit`, `page`, and `property` / `property_value` filters. Useful filter combos:

- Find a specific field on a specific parent row: `property=database&property_value=list_seo` + `property=database_id&property_value=120` + `property=key&property_value=hero_content_overlay_opacity`
- List all metadata for a parent: filter by `database` + `database_id` only.

### Get — `GET /api/v2/users_meta/get/{meta_id}`

Single record.

### Create — `POST /api/v2/users_meta/create`

**Required:** `database`, `database_id`, `key`, `value`
**Optional:** `date_added` (YYYYMMDDHHmmss)

### Update — `PUT /api/v2/users_meta/update`

**Required:** `meta_id`, `value`. Fields omitted are untouched.

### Delete — `DELETE /api/v2/users_meta/delete`

**Required:** `meta_id`. Irreversible.

## CRITICAL: WebPage (list_seo) EAV workaround

BD's `list_seo` table mixes DIRECT columns with EAV rows in `users_meta`. Behavior split:

- **On CREATE** (`createWebPage`): BD writes ALL fields correctly — direct columns AND users_meta rows are seeded together.
- **On UPDATE** (`updateWebPage`): only the direct columns get written. The following 18 fields are stored in `users_meta` and must be updated via this resource instead:

```
linked_post_category
linked_post_type
disable_preview_screenshot
disable_css_stylesheets
hero_content_overlay_opacity
hero_link_target_blank
hero_background_image_size
hero_link_size
hero_link_color
hero_content_font_size
hero_section_content
hero_column_width
h2_font_weight
h1_font_weight
h2_font_size
h1_font_size
hero_link_text
hero_link_url
```

### Update workflow (per field)

1. **Find the existing meta_id** via `listUserMeta` filtered by `database=list_seo`, `database_id=<seo_id>`, `key=<field_name>`.
2. **If a row is returned** → call `updateUserMeta` with `meta_id=<found>` and `value=<new value>`.
3. **If no row is returned** → call `createUserMeta` with `database=list_seo`, `database_id=<seo_id>`, `key=<field_name>`, `value=<new value>`.

### Reads merge automatically

`getWebPage` and `listWebPages` return the parent record with users_meta values already merged at the top level. You do NOT need to query users_meta separately for reads — only writes.

### Delete cleanup

When an agent calls `deleteWebPage(seo_id=X)`, BD does NOT cascade-delete the corresponding users_meta rows. To prevent orphan buildup:

1. Call `listUserMeta` with `database=list_seo`, `database_id=<X>`.
2. Call `deleteUserMeta(meta_id=...)` for each returned row.

Be SURGICAL — only delete meta rows where `database_id` exactly matches the deleted page's `seo_id`. Never bulk-delete across unrelated `database_id`s or `database` values.

## Hero workflow example

"Change the overlay opacity on page 120 to 0.5":

```
# 1. find the meta row
GET /api/v2/users_meta/get
  ?property[]=database&property_value[]=list_seo
  &property[]=database_id&property_value[]=120
  &property[]=key&property_value[]=hero_content_overlay_opacity
  &property_operator[]==

# 2a. if returned (e.g. meta_id=39804):
PUT /api/v2/users_meta/update
  meta_id=39804
  value=0.5

# 2b. if not returned:
POST /api/v2/users_meta/create
  database=list_seo
  database_id=120
  key=hero_content_overlay_opacity
  value=0.5

# 3. refresh cache so the change renders publicly
POST /api/v2/website_settings/refresh_cache (or call `refreshSiteCache` MCP tool)
```
