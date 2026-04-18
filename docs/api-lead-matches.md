# BD API — Lead Matches Endpoints
_Source: https://support.brilliantdirectories.com/support/solutions/articles/12000108074_

Matches between leads and members/providers.

## Endpoints

### 1. List Lead Matches
`GET /api/v2/lead_matches/get`

Supports pagination. Returns `match_id`, `lead_id`, `user_id`, `lead_matched`, `lead_points`, `lead_match_notes`, `lead_status`, `match_price`, `lead_token`, `lead_matched_by`, `lead_viewed`, `lead_type`, `lead_distance`, `lead_rating`, `lead_chosen`, `lead_response`, `lead_accepted`, `lead_updated`.

### 2. Get Single Lead Match
`GET /api/v2/lead_matches/get/{match_id}`

### 3. Create Lead Match
`POST /api/v2/lead_matches/create`

**Required:** `lead_id`, `user_id`, `lead_matched`, `lead_status`, `match_price`, `lead_token`, `lead_matched_by`, `lead_updated`
**Optional:** `lead_points`, `lead_match_notes`, `lead_viewed`, `lead_type`, `lead_distance`, `lead_rating`, `lead_chosen`, `lead_response`, `lead_accepted`

### 4. Update Lead Match
`PUT /api/v2/lead_matches/update`

**Required:** `match_id`
**Optional:** Any lead match field

### 5. Delete Lead Match
`DELETE /api/v2/lead_matches/delete`

**Required:** `match_id`
