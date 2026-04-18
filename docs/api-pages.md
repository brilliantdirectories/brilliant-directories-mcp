# BD API — Pages (list_seo) Endpoints
_Source: https://support.brilliantdirectories.com/support/solutions/articles/12000108123_

The `list_seo` resource manages static and SEO-enabled pages across a BD site: the homepage, about/contact pages, custom landing pages, category pages, profile templates, and search result pages. Each record represents one page of the site.

> ⚠️ **Known BD limitation — pages created via API need one manual step to become publicly accessible.**
>
> When `createPage` (or sometimes `updatePage`) writes a new page record via API, the BD site's URL router doesn't pick it up immediately — the new URL will return 404 on the public site until BD's admin save-handler runs.
>
> **Workaround:** after calling `createPage` via API, tell the user to:
> 1. Go to **BD Admin → Manage Pages**
> 2. Find the newly-created page (by nickname or filename)
> 3. Click **Save** (no changes needed — just click Save)
>
> That triggers BD's internal URL registration / cache rebuild and the page becomes live.
>
> This is a BD API gap (no programmatic cache-flush endpoint exists yet), not an MCP bug. Until BD adds an API to trigger the rebuild, AI agents should always warn users about this step after creating pages.

## Endpoints

### 1. List Pages
`GET /api/v2/list_seo/get`

Supports pagination.

**Response fields:** `seo_id`, `seo_type`, `filename`, `nickname`, `title`, `meta_desc`, `content_active`, `revision_timestamp`, plus all other fields below.

### 2. Get Single Page
`GET /api/v2/list_seo/get/{seo_id}`

### 3. Create Page
`POST /api/v2/list_seo/create`

**Required:** `seo_type` (page type identifier — e.g. `home`, `custom`, `profile`, `search`), `filename` (URL slug — e.g. `about-us`)
**Commonly supplied:** `nickname` (admin-panel label), `title` (HTML title), `meta_desc`, `meta_keywords`, `h1`, `h2`, `content` (HTML body — supports `[widget=Name]` shortcodes), `content_active` (1 = active)

### 4. Update Page
`PUT /api/v2/list_seo/update`

**Required:** `seo_id`
**Optional:** Any field from the object below.

### 5. Delete Page
`DELETE /api/v2/list_seo/delete`

**Required:** `seo_id`

## Page Object Fields

| Field | Type | Description |
|---|---|---|
| `seo_id` | integer | Primary key (read-only) |
| `master_id` | integer | Master record ID; 0 for site-level records |
| `seo_type` | string | Page type (`home`, `profile`, `search`, `custom`, etc.) — required on create |
| `database` | string | Associated database table for this page type |
| `section` | string | Section or sub-type |
| `database_id` | integer | Associated database record ID; 0 = global page |
| `filename` | string | URL slug (e.g. `home`, `about-us`) — required on create |
| `title` | text | HTML `<title>` content — supports template tokens (`%%%website_name%%%`, `%%Profession%%`, etc.) |
| `meta_keywords` | text | Meta keywords — supports template tokens |
| `meta_desc` | text | Meta description — supports template tokens |
| `seo_text` | text | Additional SEO body text rendered on the page |
| `date_updated` | string | Format: YYYYMMDDHHmmss |
| `updated_by` | string | Admin who last updated |
| `facebook_title` | string | Open Graph title for social sharing |
| `facebook_desc` | text | Open Graph description |
| `facebook_image` | string | Open Graph image URL |
| `h1` | text | H1 heading — supports template tokens |
| `h2` | text | H2 heading — supports template tokens |
| `breadcrumb` | string | Breadcrumb label |
| `content_menu` | string | Menu section this page belongs to |
| `nickname` | string | Human-readable label in admin panel |
| `content_order` | integer | Sort order within menu/section |
| `content` | text | Main HTML body — supports `[widget=Name]` shortcodes and template tokens |
| `content_footer` | text | Additional HTML below main content |
| `content_active` | integer | 1 = active, 0 = hidden |
| `show_form` | integer | 1 = show contact form, 0 = hide |
| `form_name` | string | Form slug to render if `show_form` is enabled |
| `content_images` | text | JSON array of image references |
| `content_css` | text | Page-scoped custom CSS (nullable) |
| `content_settings` | text | JSON object of layout/display settings |
| `menu_layout` | string | Navigation menu layout template |
| `hide_from_menu` | integer | 1 = hide from navigation menus |
| `hide_header_links` | integer | 1 = hide header navigation links |
| `hide_header` | integer | 1 = hide site header |
| `hide_footer` | integer | 1 = hide site footer |
| `hide_top_right` | integer | 1 = hide top-right header area |
| `org_template` | integer | Template/layout ID |
| `content_group` | string | Admin-panel grouping label |
| `content_layout` | string | Content area layout variant |
| `content_head` | text | HTML/shortcodes in page header area (nullable) |
| `content_sidebar` | string | Sidebar configuration or widget shortcode |
| `revision_timestamp` | timestamp | Auto-updated last-modified time |
| `custom_html_placement` | string | Custom HTML placement identifier |
| `allowed_products` | string | Comma-separated plan/product IDs (empty = all plans) |
| `content_footer_html` | text | Raw HTML at bottom of page (nullable) |
| `enable_hero_section` | string | "1" = enable hero section |
| `hero_image` | string | Hero background image URL |
| `hero_section_content` | string | Hero HTML content |
| `hero_alignment` | string | `left`, `center`, `right` |
| `hero_column_width` | string | Hero column width |
| `hero_top_padding` | string | Pixels |
| `hero_bottom_padding` | string | Pixels |
| `hero_content_font_size` | string | Font size |
| `hero_content_font_color` | string | Color |
| `hero_content_overlay_color` | string | Overlay color |
| `hero_content_overlay_opacity` | string | Overlay opacity |
| `hero_background_image_size` | string | CSS `background-size` value (`cover`, `contain`, etc.) |
| `hero_hide_banner_ad` | string | "1" = hide banner ad |
| `hero_link_text` | string | Hero CTA link text |
| `hero_link_url` | string | Hero CTA link URL |
| `hero_link_color` | string | CTA link color |
| `hero_link_size` | string | CTA link font size |
| `hero_link_target_blank` | string | "1" = open in new tab |
| `h1_font_size` | string | Hero H1 font size |
| `h1_font_weight` | string | Hero H1 font weight |
| `h1_font_color` | string | Hero H1 color |
| `h2_font_size` | string | Hero H2 font size |
| `h2_font_weight` | string | Hero H2 font weight |
| `h2_font_color` | string | Hero H2 color |
| `linked_post_type` | string | Linked post type |
| `linked_post_category` | string | Linked post category |
| `private_page_select` | string | Access control setting |
| `page_render_widget` | string | Widget ID to render as page content |
