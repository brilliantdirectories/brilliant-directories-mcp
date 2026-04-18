# BD API — Users Endpoints
_Source: https://support.brilliantdirectories.com/support/solutions/articles/12000108047_

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
