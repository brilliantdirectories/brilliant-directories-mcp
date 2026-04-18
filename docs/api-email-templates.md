# BD API — Email Templates Endpoints
_Source: https://support.brilliantdirectories.com/support/solutions/articles/12000108093_

## Endpoints

### 1. List Email Templates
`GET /api/v2/email_templates/get`

Supports pagination.

**Response fields:** `email_id`, `email_name`, `email_type`, `email_subject`, `email_body` (HTML, supports merge tags + widget embeds), `triggers`, `signature`, `unsubscribe_link`, `category_id`, etc.

### 2. Get Single Email Template
`GET /api/v2/email_templates/get/{email_id}`

### 3. Create Email Template
`POST /api/v2/email_templates/create`

**Required:** `email_name` (internal slug)
**Optional:** `email_subject` (supports merge tags like `%%%website_name%%%`), `email_body` (HTML + merge tags), `email_type` (transactional/campaign), `triggers` (comma-separated events), `website` (0=platform-wide), `email_from`, `priority` (0=normal), `signature` (0/1), `category_id`, `notemplate` (0/1 send without wrapper), `content_type` (MIME override), `unsubscribe_link` (0/1)

### 4. Update Email Template
`PUT /api/v2/email_templates/update`

**Required:** `email_id`
**Optional:** All template fields

### 5. Delete Email Template
`DELETE /api/v2/email_templates/delete`

**Required:** `email_id`

## Email Template Object Fields

| Field | Type | Description |
|---|---|---|
| `email_id` | integer | Primary key (read-only) |
| `email_name` | string | Internal slug — required on create |
| `email_type` | string | transactional, campaign, etc. |
| `email_subject` | string | Subject line — supports merge tags |
| `email_body` | text | HTML body — supports merge tags + widget embeds |
| `date_created` | string | Format: YYYYMMDDHHmmss |
| `triggers` | string | Comma-separated auto-send event triggers |
| `website` | integer | 0 = platform-wide |
| `email_from` | string | Sender override (blank = site default) |
| `priority` | integer | 0 = normal, higher = higher priority |
| `signature` | integer | 1 = append site signature |
| `category_id` | integer | Template category grouping |
| `notemplate` | integer | 1 = send without wrapper |
| `content_type` | string | MIME override (blank = HTML) |
| `revision_timestamp` | timestamp | Auto-managed last modified |
| `unsubscribe_link` | integer | 1 = include unsubscribe link |
