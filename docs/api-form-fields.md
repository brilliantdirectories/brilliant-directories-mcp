# BD API — Form Fields Endpoints
_Source: https://support.brilliantdirectories.com/support/solutions/articles/12000108076_

## Endpoints

### 1. List Form Fields
`GET /api/v2/form_fields/get`

Supports pagination. Returns `field_id`, `form_name`, `field_text` (label), `field_name` (DB column), `field_type` (text/textarea/select/checkbox), `field_order`, `field_required` (0/1), `field_display_view`, `field_input_view`.

### 2. Get Single Form Field
`GET /api/v2/form_fields/get/{field_id}`

### 3. Create Form Field
`POST /api/v2/form_fields/create`

**Required:** `form_name` (parent form slug), `field_name` (DB column), `field_text` (display label), `field_type` (text/textarea/select/checkbox), `field_order`
**Optional:** `field_required` (0/1), `field_placeholder`, `field_input_view` (show in edit), `field_display_view` (show in public), `field_email_view` (include in notifications)

### 4. Update Form Field
`PUT /api/v2/form_fields/update`

**Required:** `field_id`
**Optional:** Any field property

### 5. Delete Form Field
`DELETE /api/v2/form_fields/delete`

**Required:** `field_id`
