# BD API — Leads Endpoints
_Source: https://support.brilliantdirectories.com/support/solutions/articles/12000108049_

**Related support articles:**
- https://support.brilliantdirectories.com/support/solutions/articles/12000091106 (How to Edit Lead Data with API Calls)

## Operational rules (from support article 12000091106)

### Lead email notifications
- `send_lead_email_notification=1` on `createLead` activates email notifications to site admin and/or matched members. Default: off — leads created via API are silent.
- Automatic matching (finds members by category/location/service-area) runs only at create time: pass `auto_match=1` on `createLead`. `users_to_match` routes the lead to listed members instead.

---

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

**Required:** `lead_id`, `users_to_match` (comma-separated member IDs or emails)

Matches the lead to the listed members only; it does not search by category or location. `send_lead_email_notification=1` emails each matched member.

**Response:** `{ "status": "success", "message": { "succes_matches": "sample@example.com - ID#1", "fail_matches": "" } }`. Without `users_to_match`: `{ "status": "error", "message": "Nothing to Match" }`.

### 5. Update Lead
`PUT /api/v2/leads/update`

**Required:** `lead_id`
**Optional:** `lead_name`, `lead_notes`, any lead field

### 6. Delete Lead
`DELETE /api/v2/leads/delete`

**Required:** `lead_id`
