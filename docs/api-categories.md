# BD API — Categories (Professions) Endpoints
_Source: https://support.brilliantdirectories.com/support/solutions/articles/12000108057_

Categories (internally called "professions") — the **top-level** taxonomy for organizing members and content. Stored in `list_professions`.

## How BD's taxonomy is structured (read this first)

BD has a 3-level taxonomy mapped to 3 separate API resources. Agents get this wrong often — here's the canonical model:

| Level | User-facing term | BD internal term | API resource | Create endpoint | User field |
|---|---|---|---|---|---|
| **Group** | Category Group | — | `CategoryGroup` (`list_categories`) | `createCategoryGroup` | (grouping only) |
| **Top-level** | Category | Profession | `Category` (`list_professions`) | `createCategory` | `profession_id` |
| **Sub-level** | Service | Service | `Service` (`list_services`) | `createService` | `services` (CSV of IDs) |
| **Join** | Member ↔ Service | rel_services | `UserService` (`rel_services`) | `createUserService` | — |

**Example — "Restaurants (top) → Sushi (sub), assign Alice as a sushi spot":**

1. `listCategoryGroups` → confirm a group exists. Most sites have one default group, typically `group_id=1` ("Member"). If missing, call `createCategoryGroup`.
2. `createCategory` with `name=Restaurants`, `filename=restaurants`, `group_id=1` → returns `category_id` (this is what populates a user's `profession_id`).
3. `createService` with `name=Sushi`, `profession_id=<Restaurants category_id>`, `filename=sushi` → returns `service_id`.
4. Assign Alice: either `updateUser` with `profession_id=<Restaurants>` + `services=<Sushi service_id>` (member's primary classification), OR `createUserService` with `user_id=<Alice>` + `service_id=<Sushi>` (adds a join-table row with pricing/specialty).

**Common agent mistakes:**
- Confusing `createCategory` (top-level profession) with `createService` (sub-classification under a profession). New top-level → `createCategory`. Sub under existing → `createService`.
- Looking for a `createProfession` tool. Doesn't exist — `createCategory` IS the profession-creator. "Profession" is BD's internal DB name; the public API calls it "Category."
- Thinking `group_id` is optional. It isn't — `createCategory` requires `group_id`. Always `listCategoryGroups` first.

## Endpoints

### 1. List Categories
`GET /api/v2/category/get`

Supports pagination. Returns `category_id`, `name`, `group_id`, `filename`, `icon`, `keywords`, `revision_timestamp`, `json_meta`.

### 2. Get Single Category
`GET /api/v2/category/get/{category_id}`

### 3. Create Category
`POST /api/v2/category/create`

**Required:** `name`, `filename`, `group_id`
**Optional:** `keywords`, `icon`

### 4. Update Category
`PUT /api/v2/category/update`

**Required:** `category_id`
**Optional:** `name`, `filename`, `group_id`, `keywords`, `icon`

### 5. Delete Category
`DELETE /api/v2/category/delete`

**Required:** `category_id`
