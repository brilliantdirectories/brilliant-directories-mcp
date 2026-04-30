# BD API — Widgets Endpoints

**Tools:** `listWidgets`, `getWidget`, `createWidget`, `updateWidget`, `deleteWidget`, `renderWidget`
**Underlying endpoint:** `/api/v2/data_widgets/*`
**BD table:** `data_widgets`
**Primary key:** `widget_id`

**Related support articles:**
- https://support.brilliantdirectories.com/support/solutions/articles/12000108056 (primary API Reference — Widgets)
- https://support.brilliantdirectories.com/support/solutions/articles/12000103396 (Widgets API — How to edit widgets data with API Calls)

Widgets are reusable HTML/CSS/JS components that power the BD front-end. Each widget is a self-contained unit of HTML + scoped CSS + optional JS. Pages reference them via `[widget=Name]` shortcode (production rendering); email templates embed them similarly. The `renderWidget` MCP tool is **diagnostic-only** (see `Rule: Widget code fields` scenario 3); third-party REST clients can still call the underlying endpoint directly for cross-site embedding.

## Widget object fields

| Field | Type | Description |
|---|---|---|
| `widget_id` | integer | Primary key (read-only) |
| `widget_name` | string | Widget name/label — REQUIRED on create; must be unique per site |
| `widget_type` | string | Widget classification (default `Widget`) |
| `widget_data` | text | Widget HTML content |
| `widget_style` | text | Widget CSS (scoped to the widget via `widget_class` / `div_id`) |
| `widget_javascript` | text | Widget JavaScript |
| `widget_settings` | text | Configuration (JSON or serialized) |
| `widget_values` | text | Widget variable values |
| `widget_class` | string | CSS class names applied to the container |
| `widget_viewport` | string | Where it appears: `front` (public), `admin` (admin panel only), `both` |
| `widget_html_element` | string | HTML element wrapping the widget (default `div`) |
| `div_id` | string | HTML id attribute for the container |
| `short_code` | string | Shortcode reference for this widget |
| `bootstrap_enabled` | integer | `1` if Bootstrap framework is required |
| `ssl_enabled` | integer | `1` if SSL/HTTPS required |
| `mobile_enabled` | integer | `1` if mobile viewport enabled |
| `file_type` | string | File type of the widget |
| `date_updated` | string | Date last updated |
| `updated_by` | string | User who last updated |
| `revision_timestamp` | timestamp | Auto-updated on write |

## Endpoints

### List Widgets
`GET /api/v2/data_widgets/get` — paginated + filterable. Common filter: `widget_viewport=front` to get only public-facing widgets.

### Get One Widget (raw source)
`GET /api/v2/data_widgets/get/{widget_id}` — returns the widget's source HTML/CSS/JS, not the rendered output.

### Create Widget
`POST /api/v2/data_widgets/create`
- **Required:** `widget_name` (unique per site)
- **Common:** `widget_data` (HTML), `widget_style` (CSS), `widget_javascript` (JS), `widget_viewport`, `bootstrap_enabled`

### Update Widget
`PUT /api/v2/data_widgets/update`
- **Required:** `widget_id`
- **Caveat:** BD may cache server-side; call `refreshSiteCache` if edits don't appear immediately on some themes.

### Delete Widget
`DELETE /api/v2/data_widgets/delete`
- **Required:** `widget_id`
- **Caveat:** any `[widget=Name]` shortcode on pages/emails referencing the deleted widget renders empty/broken.

### Render Widget (get rendered HTML output)
`POST /api/v2/data_widgets/render`

**Diagnostic-only via MCP.** See `Rule: Widget code fields` scenario 3 in `mcp-instructions.md` — the MCP `renderWidget` tool exists to confirm render-pipeline symptoms (backslash strip, `<style>` auto-wrap, `<script>` wrapper) during troubleshoot. Production widget rendering on a customer's BD site is always via `[widget=Name]` shortcode in page or email content — never call the MCP tool to deliver widget HTML to end users. Direct REST calls to this endpoint (outside MCP) are still valid for third-party-embedding integrations; that path is documented below.

- **Required:** either `widget_id` OR `widget_name` (both work as lookup keys)
- **Prerequisite:** the widget must have been customized/saved at least once in the BD admin — un-customized widgets return empty output.
- **Side effect:** rendering executes the widget's server-side PHP. May trigger DB queries, cache lookups, or counter increments. Use carefully in loops.

**Response shape (distinct from the standard envelope):**

```json
{
  "status": "success",
  "message": "Widget rendered successfully",
  "name": "Bootstrap Theme - Homepage Search - Yellow Pages Search",
  "output": "<div class=\"col-xs-12 col-sm-12 col-md-6 search_box fpad img-rounded center-block\">\r\n  <form class=\"fpad form-horizontal website-search\" name=\"frm1\" action=\"/search_results\">...</form>\r\n</div>"
}
```

`name` and `output` are TOP-LEVEL fields, siblings of `message` — NOT nested inside it. Read `output` directly, not `message.output`.

**Error shape:**

```json
{ "status": "error", "message": "Widget not found", "name": "", "output": "" }
```

When the widget doesn't exist or isn't customized, `name` and `output` come back as empty strings.

**Note on CSS/JS:** the `output` field contains only the rendered HTML body. If you need the widget's CSS or JS for external embedding, fetch them separately via `getWidget` (fields `widget_style` and `widget_javascript`) and inject them into your host page.

## Third-party REST embedding (NOT an MCP use case)

**This pattern requires direct REST calls outside the MCP — the `renderWidget` MCP tool is diagnostic-only.** Third-party developers integrating BD widgets on non-BD sites (a partner's WordPress site, a Shopify store, an external dashboard) call the BD REST endpoint directly:

```
1. createWidget on BD with HTML/CSS/JS
2. Customize/save once in BD admin (prerequisite for render to return output)
3. From external site: POST /api/v2/data_widgets/render with widget_id (direct REST, not MCP)
4. Inject response's `output` field into the external page DOM
5. If needed, also getWidget to pull widget_style / widget_javascript
   and include them in the external page <head>/<script>
```

This is render-on-request via the REST endpoint. It does not flow through the MCP. Agents operating an admin's BD site never need this pattern — production rendering on the customer's own site is always via `[widget=Name]` shortcode.
