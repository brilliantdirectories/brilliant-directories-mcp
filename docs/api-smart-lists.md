# BD API — Smart Lists Endpoints
_Source: https://support.brilliantdirectories.com/support/solutions/articles/12000108113_

Dynamic filtered lists of members, leads, reviews, transactions, or newsletter subscribers.

## Endpoints

### 1. List Smart Lists
`GET /api/v2/smart_lists/get`

Supports pagination. Returns `smart_list_id`, `smart_list_name`, `smart_list_type`, `smart_list_created_by`, `smart_list_query_params`, `schedule`.

### 2. Get Single Smart List
`GET /api/v2/smart_lists/get/{smart_list_id}`

### 3. Create Smart List
`POST /api/v2/smart_lists/create`

**Required:** `smart_list_name`, `smart_list_type` (members/forms_inbox/leads/reviews/transaction/newsletter), `smart_list_created_by` (admin user ID)
**Optional:** `smart_list_query_params` (filter criteria), `schedule` (recurrence frequency)

### 4. Update Smart List
`PUT /api/v2/smart_lists/update`

**Required:** `smart_list_id`
**Optional:** `smart_list_name`, `smart_list_modified_by`, `smart_list_query_params`, `schedule`

### 5. Delete Smart List
`DELETE /api/v2/smart_lists/delete`

**Required:** `smart_list_id`
