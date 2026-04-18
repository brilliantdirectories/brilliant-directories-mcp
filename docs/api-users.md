# BD API — Users Endpoints
_Source: https://support.brilliantdirectories.com/support/solutions/articles/12000108047_

**Related support articles:**
- https://support.brilliantdirectories.com/support/solutions/articles/12000091105 (How to Edit Member Data with API Calls)
- https://support.brilliantdirectories.com/support/solutions/articles/12000103947 (Users API — How to Manage Users with API Calls)

## Authentication
- Header: `X-Api-Key: {your-api-key}`
- Verify: `GET /api/v2/token/verify`
- Rate limit: 100 req/60s (max 1,000/min configurable)

## Pagination
- `page` (cursor token), `limit` (default 25, max 100)
- Response: `total`, `current_page`, `total_pages`, `next_page`, `prev_page`, `message[]`

## Filtering (all list endpoints)
- `property` / `property[]` — field name(s)
- `property_value` / `property_value[]` — value(s)
- `property_operator` / `property_operator[]` — `=`, `LIKE`, `>`, `<`, `>=`, `<=`
- `order_column` + `order_type` (ASC/DESC)

## Field Discovery
- `GET /api/v2/user/fields` — returns `[{ "key": "first_name", "label": "first_name", "required": 0 }, ...]`

## Profile URL — how to get a member's public profile link

Every member record has a `filename` field. This is the **complete relative URL path** for their public profile (not just a slug). To get the full profile URL, concatenate the site domain with the `filename` value:

```
profile_url = site_domain + "/" + user.filename
```

**Example:**
- Site: `https://launch60031.directoryup.com`
- User `filename`: `united-states/monterey-park/doctor/harrison-hasanuddin-d-o`
- Full URL: `https://launch60031.directoryup.com/united-states/monterey-park/doctor/harrison-hasanuddin-d-o`

**DO NOT** guess prefixes like `/business/`, `/profile/`, `/member/`, `/listing/`. BD's server-side router uses `filename` verbatim — whatever path is stored there is what resolves. The path format varies per site based on admin settings (some sites use pretty URLs with country/state/city/category segments; others use flat slugs), but the API consumer never needs to care: **just concatenate domain + filename and the URL works.**

## Image imports — when creating or updating users with external image URLs

The user schema has three image-URL fields: `profile_photo`, `logo`, `cover_photo`. By default, BD **stores whatever URL you pass as-is** — if you pass `https://example.com/scraped-logo.png`, that exact URL is used when rendering the member profile. If that host ever goes down, the image breaks.

To make BD **fetch the external image and save it locally** to your site's storage, set `auto_image_import=1` on create or update. This is the right default for:
- Web-scrape → BD import flows (like adding external business listings)
- CSV imports from external sources
- Cross-site migrations

**Example — creating a user with a scraped logo, locally hosted after create:**

```
POST /api/v2/user/create
{
  "email": "info@elevatedwellness.com",
  "password": "...",
  "subscription_id": 1,
  "logo": "https://source-site.com/images/logo.png",
  "auto_image_import": "1"
}
```

After the API returns success, BD asynchronously downloads the image and replaces the `logo` field with the local filename. Processing delay: a few minutes. Skip `auto_image_import=1` only when the user explicitly asks to keep the external URL reference (e.g., using a CDN they control).

---

## Operational rules (from support article 12000091105)

### Email notifications
- `send_email_notifications=1` on `createUser` triggers the welcome email (based on the membership plan's configured email). Default: off — API creates are silent.

### Uniqueness constraints
- `email` must be unique unless the site setting `allow_duplicate_member_emails` is enabled.
- `email` + `password` combo must ALWAYS be unique (regardless of site settings).
- `token` (when supplied) must be exactly 32 alphanumeric characters AND unique across all members.

### Validation behaviors
- URL fields (`website`, `booking_link`, `blog`, `facebook`, `twitter`, `linkedin`, `instagram`, etc.) are validated on write; invalid formats are silently skipped (not rejected — the rest of the payload still saves). Must start with `http://` or `https://`.
- Category/service NAME references in any field should be wrapped in single quotes (e.g. `'25-30'`, `'Cosmetic Dentistry'`) to avoid parser confusion on dashes/spaces.

### Prerequisites
- `subscription_id` must reference an existing membership plan (from `listMembershipPlans` or `createMembershipPlan`).
- `profession_id` must reference an existing top-level category (from `listTopCategories` or `createTopCategory`).

### Inline category creation (updateUser only)
- `create_new_categories=1` on `updateUser` allows inline-creating new sub and sub-sub categories under the member's current top-level category, instead of requiring them to exist first.

---

## Endpoints

### 1. List Users
`GET /api/v2/user/get`

Supports pagination, filtering, sorting.

**Response:** `{ "status": "success", "total": 84, "current_page": 1, "total_pages": 4, "next_page": "...", "message": [{ user objects }] }`

### 2. Get Single User
`GET /api/v2/user/get/{user_id}`

**Response:** Same structure, `message` array with 1 item.

### 3. Create User
`POST /api/v2/user/create`

**Required:** `email`, `password`, `subscription_id`
**Optional:** `first_name`, `last_name`, `company`, `phone_number`, `city`, `state_code`, `country_code`

**Response:** `{ "status": "success", "message": { user object with user_id } }`

### 4. Update User
`PUT /api/v2/user/update`

**Required:** `user_id`
**Optional:** Any user field + special params:
- `member_tag_action` (1) + `member_tags` (comma-separated IDs)
- `credit_action` (add/deduct/override) + `credit_amount`
- `images_action` (remove_all/remove_cover_image/remove_logo_image/remove_profile_image)
- `services` (category=>service1,service2)
- `auto_geocode` (1)

**Response:** `{ "status": "success", "message": { updated user object } }`

### 5. Delete User
`DELETE /api/v2/user/delete`

**Required:** `user_id`
**Optional:** `delete_images` (1)

**Response:** `{ "status": "success", "message": "user record was deleted" }`

### 6. Search Users
`POST /api/v2/user/search`

**Params:** `q` (keyword), `pid` (category), `tid` (sub-category), `ttid` (sub-sub-category), `address`, `sort` (reviews/name ASC/name DESC/last_name_asc/last_name_desc), `page`, `limit`, `dynamic` (1), `output_type` (array/html)

### 7. User Login
`POST /api/v2/user/login`

**Required:** `email`, `password`
**Response:** `{ "status": "success", "message": "credentials are valid" }`
Note: Does NOT return profile data — use GET /api/v2/user/get after.

### 8. User Transactions
`POST /api/v2/user/transactions`

**Required:** `user_id`

### 9. User Subscriptions
`POST /api/v2/user/subscriptions`

**Required:** `user_id`
