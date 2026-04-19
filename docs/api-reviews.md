# BD API — User Reviews Endpoints
_Source: https://support.brilliantdirectories.com/support/solutions/articles/12000108053_

**Related support articles:**
- https://support.brilliantdirectories.com/support/solutions/articles/12000097913 (How to Edit Reviews Data with API Calls)

## Endpoints

### 1. List Reviews
`GET /api/v2/users_reviews/get`

Supports pagination + filtering via `property[]` / `property_value[]`.

### 2. Get Single Review
`GET /api/v2/users_reviews/get/{review_id}`

### 3. Create Review
`POST /api/v2/users_reviews/create`

**Required:** `user_id`
**Optional:** `review_name`, `review_email`, `review_title`, `review_description`, `rating_overall` (1-5), `recommend` (0/1), `review_status` (0=Pending, 2=Accepted, 3=Declined, 4=Waiting for Admin — value 1 is NOT valid)

### 4. Update Review
`PUT /api/v2/users_reviews/update`

**Required:** `review_id`
**Optional:** Any review field

### 5. Delete Review
`DELETE /api/v2/users_reviews/delete`

**Required:** `review_id`

### 6. Search Reviews
`POST /api/v2/users_reviews/search`

**Optional:** `user_id`, `review_status`, any review field
