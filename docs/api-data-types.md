# BD API — Data Types (post type definitions) Endpoints
_Source: https://support.brilliantdirectories.com/support/solutions/articles/12000108105_

The `data_types` resource defines the content-type templates available on a BD site — things like "Single Photo Post," "Multi-Photo Post," "Video Post," "Document Post." Each row is a type of entry that members can create, depending on their membership plan.

**The `data_type` reference field** on posts (e.g. `createSingleImagePost`, `createMultiImagePost`) takes a `data_id` from this table. There's no fixed enum — every BD site has its own set of data types configured. Always call `listDataTypes` first to discover valid IDs.

## Endpoints

### 1. List Data Types
`GET /api/v2/data_types/get`

Supports pagination.

**Response fields:** `data_id`, `category_name`, `category_active`, `revision_timestamp`, `limit_available`.

### 2. Get Single Data Type
`GET /api/v2/data_types/get/{data_id}`

### 3. Create Data Type
`POST /api/v2/data_types/create`

**Required:** `category_name` (display name), `category_active` (1 active / 0 inactive)
**Optional:** `limit_available` (1 = membership-plan posting limits apply to this type; 0 = no limits)

### 4. Update Data Type
`PUT /api/v2/data_types/update`

**Required:** `data_id`
**Optional:** `category_name`, `category_active`, `limit_available`

### 5. Delete Data Type
`DELETE /api/v2/data_types/delete`

**Required:** `data_id`

## Data Type Object Fields

| Field | Type | Description |
|---|---|---|
| `data_id` | integer | Primary key (read-only) |
| `category_name` | string | Display name for this content type — required on create |
| `category_active` | integer | `1` = active and available, `0` = inactive. Required on create. |
| `revision_timestamp` | timestamp | Auto-updated last-modified time |
| `limit_available` | integer | `1` = membership-plan posting limits apply, `0` = unlimited for this type |

## How to use in agent workflows

When a user asks to create a post and says something like *"make a multi-photo post about X"*:

1. Call `listDataTypes` to retrieve the site's configured types
2. Match the user's phrase to a `category_name` (e.g., "multi-photo" → find the row with `category_name: "Multi-Photo Post"`)
3. Use that row's `data_id` as the `data_type` parameter in `createPost`
4. If no matching type exists on the site, tell the user and either ask them which existing type to use, or offer to create a new one via `createDataType`

Never guess a numeric `data_id`. Always discover.
