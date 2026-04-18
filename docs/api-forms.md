# BD API — Forms Endpoints
_Source: https://support.brilliantdirectories.com/support/solutions/articles/12000108075_

## Endpoints

### 1. List Forms
`GET /api/v2/form/get`

Supports pagination. Returns `form_id`, `form_name`, `form_title`, `form_table`, `form_layout`, `revision_timestamp`.

### 2. Get Single Form
`GET /api/v2/form/get/{form_id}`

### 3. Create Form
`POST /api/v2/form/create`

**Required:** `form_name` (internal slug), `form_title`, `form_action` (post), `form_layout` (bootstrap), `form_table` (target DB table)
**Optional:** `form_class` (CSS classes), `form_email_on` (0/1), `form_email_recipient`

### 4. Update Form
`PUT /api/v2/form/update`

**Required:** `form_id`
**Optional:** `form_title`, `form_email_on`, any form field

### 5. Delete Form
`DELETE /api/v2/form/delete`

**Required:** `form_id`
