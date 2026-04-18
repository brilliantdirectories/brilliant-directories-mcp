# Brilliant Directories API — Universal AI Integration

Give any AI agent full access to your BD site with one API key.

**154 endpoints** across 28 resources: members, leads, posts, reviews, categories, email templates, smart lists, widgets, menus, forms, membership plans, and more.

## Quick Start

### 1. Get your API key

BD Admin > Settings > API Keys > Create New Key

### 2. Pick your platform

---

### Claude Code / Cursor (MCP)

```bash
# Install globally
npm install -g brilliant-directories-mcp

# Add to Claude Code
claude mcp add bd-api -- brilliant-directories-mcp --api-key YOUR_KEY --url https://your-site.com

# Or add to Cursor — edit ~/.cursor/mcp.json:
{
  "mcpServers": {
    "bd-api": {
      "command": "brilliant-directories-mcp",
      "args": ["--api-key", "YOUR_KEY", "--url", "https://your-site.com"]
    }
  }
}
```

Then ask your AI: *"List all members on my BD site"* or *"Create a new member with email john@example.com"*

---

### ChatGPT (GPT Actions)

1. Go to your GPT > Configure > Actions > Create new action
2. Paste the contents of `openapi/bd-api.json`
3. Set Authentication: API Key, Header Name: `X-Api-Key`
4. Set the server URL to your BD site

---

### n8n

1. Create a new workflow
2. Add an **HTTP Request** node
3. Set:
   - Method: `GET`
   - URL: `https://your-site.com/api/v2/user/get`
   - Header: `X-Api-Key: YOUR_KEY`
4. Or import `openapi/bd-api.json` as a custom API definition

---

### Make / Zapier

**Make:** Create a custom app using the OpenAPI spec, or use HTTP module with `X-Api-Key` header.

**Zapier:** If you already have the BD Zapier app, it uses the same underlying API. For new endpoints, use Webhooks by Zapier with the `X-Api-Key` header.

---

### curl / Any HTTP Client

```bash
# Verify your API key
curl -H "X-Api-Key: YOUR_KEY" https://your-site.com/api/v2/token/verify

# List members
curl -H "X-Api-Key: YOUR_KEY" https://your-site.com/api/v2/user/get?limit=10

# Create a member
curl -X POST -H "X-Api-Key: YOUR_KEY" \
  -d "email=new@example.com&password=secret123&subscription_id=1&first_name=Jane&last_name=Doe" \
  https://your-site.com/api/v2/user/create

# Search members
curl -X POST -H "X-Api-Key: YOUR_KEY" \
  -d "q=dentist&address=Los Angeles&limit=10" \
  https://your-site.com/api/v2/user/search

# Update a member
curl -X PUT -H "X-Api-Key: YOUR_KEY" \
  -d "user_id=42&company=New Company Name" \
  https://your-site.com/api/v2/user/update
```

---

## Authentication

All requests require the `X-Api-Key` header:

```
X-Api-Key: your-api-key-here
```

Rate limit: 100 requests per 60 seconds (configurable up to 1,000/min).

API keys are scoped by permission — you control which endpoints each key can access.

## Pagination

All list endpoints support pagination:

| Parameter | Description |
|-----------|-------------|
| `limit` | Records per page (default 25, max 100) |
| `page` | Cursor token from `next_page` in previous response |

Response includes: `total`, `current_page`, `total_pages`, `next_page`, `prev_page`

## Filtering

All list endpoints support filtering:

```
GET /api/v2/user/get?property=city&property_value=Los Angeles&property_operator==
```

Multiple filters:
```
GET /api/v2/user/get?property[]=city&property_value[]=Los Angeles&property[]=state_code&property_value[]=CA
```

Operators: `=`, `LIKE`, `>`, `<`, `>=`, `<=`

## Sorting

```
GET /api/v2/user/get?order_column=last_name&order_type=ASC
```

## Available Resources

| Resource | Base Path | Operations |
|----------|-----------|------------|
| Users/Members | `/api/v2/user/` | list, get, create, update, delete, search, login, transactions, subscriptions |
| Reviews | `/api/v2/users_reviews/` | list, get, create, update, delete, search |
| Clicks | `/api/v2/users_clicks/` | list, get, create, update, delete |
| Leads | `/api/v2/leads/` | list, get, create, match, update, delete |
| Lead Matches | `/api/v2/lead_matches/` | list, get, create, update, delete |
| Posts | `/api/v2/data_posts/` | list, get, create, update, delete, search, fields |
| Portfolio Groups | `/api/v2/users_portfolio_groups/` | list, get, create, update, delete, search, fields |
| Portfolio Photos | `/api/v2/users_portfolio/` | list, get, create, update, delete |
| Post Types | `/api/v2/data_categories/` | list, get, create, update, delete, custom_fields |
| Categories | `/api/v2/category/` | list, get, create, update, delete |
| Category Groups | `/api/v2/category_group/` | list, get, create, update, delete |
| Services | `/api/v2/list_services/` | list, get, create, update, delete |
| User Services | `/api/v2/rel_services/` | list, get, create, update, delete |
| User Photos | `/api/v2/users_photo/` | list, get, create, update, delete |
| User Metadata | `/api/v2/users_meta/` | list, get, create, update, delete |
| Tags | `/api/v2/tags/` | list, get, create, update, delete |
| Tag Groups | `/api/v2/tag_groups/` | list, get, create, update, delete |
| Tag Types | `/api/v2/tag_types/` | list, get, create, update, delete |
| Tag Relationships | `/api/v2/rel_tags/` | list, get, create, update, delete |
| Widgets | `/api/v2/data_widgets/` | list, get, create, update, delete, render |
| Email Templates | `/api/v2/email_templates/` | list, get, create, update, delete |
| Forms | `/api/v2/form/` | list, get, create, update, delete |
| Form Fields | `/api/v2/form_fields/` | list, get, create, update, delete |
| Membership Plans | `/api/v2/subscription_types/` | list, get, create, update, delete |
| Menus | `/api/v2/menus/` | list, get, create, update, delete |
| Menu Items | `/api/v2/menu_items/` | list, get, create, update, delete |
| Unsubscribe | `/api/v2/unsubscribe_list/` | list, get, create, update, delete |
| Smart Lists | `/api/v2/smart_lists/` | list, get, create, update, delete |

## Field Discovery

Some endpoints support dynamic field discovery:

```bash
# Get all available user fields
curl -H "X-Api-Key: YOUR_KEY" https://your-site.com/api/v2/user/fields

# Get custom fields for a specific post type
curl -H "X-Api-Key: YOUR_KEY" https://your-site.com/api/v2/data_posts/fields?form_name=my-form
```

## Files

| File | Purpose |
|------|---------|
| `openapi/bd-api.json` | OpenAPI 3.1 spec (single source of truth) |
| `mcp/index.js` | MCP server for Claude/Cursor |
| `mcp/package.json` | npm package definition |
| `docs/*.md` | Raw API endpoint documentation |

## Security

- API keys are never embedded in the package
- All requests go directly from the user's machine to their BD site
- No data passes through third-party servers
- API key permissions control which endpoints are accessible
- Treat your API key like a password

## Support

- BD Support: https://support.brilliantdirectories.com
- API Docs: https://support.brilliantdirectories.com/support/solutions/articles/12000108045
