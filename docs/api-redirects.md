# BD API — Redirects (redirect_301) Endpoints
_Source: https://support.brilliantdirectories.com/support/solutions/articles/12000108112_

The `redirect_301` resource manages **301 permanent redirect rules** on the site. Each record maps an old URL path to a new destination, preserving SEO and preventing broken inbound links after content moves, slug changes, or site restructuring. BD auto-generates redirects when certain admin actions happen (profile rename, post URL change, category restructure); the API also lets you create/manage custom rules manually.

## Endpoints

### 1. List Redirects
`GET /api/v2/redirect_301/get`

Supports pagination.

**Response fields:** `redirect_id`, `type`, `old_filename`, `new_filename`, `date_added`, `db_id`, `updated_by`, plus all other fields below.

### 2. Get Single Redirect
`GET /api/v2/redirect_301/get/{redirect_id}`

### 3. Create Redirect
`POST /api/v2/redirect_301/create`

**Required:** `type` (source category — `profile`, `post`, `category`, `custom`, etc.), `old_filename` (the path being redirected from, relative to domain root), `new_filename` (the destination path)

**Optional:** `db_id` (database record ID of the source content, if tied to one), `id` (legacy secondary identifier, defaults to 0)

### 4. Update Redirect
`PUT /api/v2/redirect_301/update`

**Required:** `redirect_id`
**Optional:** Any field from the object below.

### 5. Delete Redirect
`DELETE /api/v2/redirect_301/delete`

**Required:** `redirect_id`

## Redirect Object Fields

| Field | Type | Description |
|---|---|---|
| `redirect_id` | integer | Primary key (read-only) |
| `id` | integer | Legacy secondary identifier; typically `0` for system-generated redirects |
| `type` | string | Category of the redirect source (`profile`, `post`, `category`, `custom`, etc.) — required on create |
| `old_filename` | string | The old URL path being redirected from, relative to the domain root (e.g. `old-slug`, not the full URL) — required on create |
| `new_filename` | string | The new destination URL path — required on create |
| `date_added` | string | Timestamp when this redirect was created. Format: YYYYMMDDHHMMSS |
| `db_id` | integer | Database record ID of the source content object this redirect was generated from (0 if not tied to a record) |
| `updated_by` | string | Username or system identifier that created or last updated this redirect |

## Notes

- URLs should be relative to the domain root (`old-page`, `/new-page`), not absolute URLs (`https://site.com/old-page`).
- Common `type` values: `profile` (member profile URL changes), `post` (post slug changes), `category` (category/service URL changes), `custom` (manually-created rules).
- Use this resource when a site restructuring or URL change would otherwise break inbound links or kill SEO rankings.
