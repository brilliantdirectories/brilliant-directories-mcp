# BD API — Users Clicked Links Endpoints
_Source: https://support.brilliantdirectories.com/support/solutions/articles/12000108048_

Tracks link clicks and interactions on member profiles and listings.

## Endpoints

### 1. List Click Records
`GET /api/v2/users_clicks/get`

Supports filtering via `property` / `property_value`.

### 2. Get Single Click Record
`GET /api/v2/users_clicks/get/{click_id}`

### 3. Create Click Record
`POST /api/v2/users_clicks/create`

**Required:** `user_id`, `click_type` (link/phone/email), `click_name`, `click_from` (profile_page/search_results), `click_url`

### 4. Update Click Record
`PUT /api/v2/users_clicks/update`

**Required:** `click_id`
**Optional:** Any click field

### 5. Delete Click Record
`DELETE /api/v2/users_clicks/delete`

**Required:** `click_id`

### 6. Search Click Records
`POST /api/v2/users_clicks/search`

**Note:** Search endpoint not currently available for this model.
