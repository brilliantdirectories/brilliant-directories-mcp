# BD API — Leads Endpoints
_Source: https://support.brilliantdirectories.com/support/solutions/articles/12000108049_

## Endpoints

### 1. List Leads
`GET /api/v2/leads/get`

Supports pagination + filtering.

### 2. Get Single Lead
`GET /api/v2/leads/get/{lead_id}`

### 3. Create Lead
`POST /api/v2/leads/create`

**Required:** `lead_name`, `lead_email`, `lead_phone`, `lead_message`, `lead_location`, `top_id`

**Response includes:** `lead_id`, `token`, `date_added`, `status`, `lead_price`, `lead_status`, `flow_source`

### 4. Match Lead
`POST /api/v2/leads/match`

**Required:** `lead_id`

Triggers automatic matching — system finds members matching category, location, and service area, then sends notification emails.

**Response:** `{ "status": "success", "message": "Lead matched to 5 members" }`

### 5. Update Lead
`PUT /api/v2/leads/update`

**Required:** `lead_id`
**Optional:** `lead_name`, `lead_notes`, any lead field

### 6. Delete Lead
`DELETE /api/v2/leads/delete`

**Required:** `lead_id`
