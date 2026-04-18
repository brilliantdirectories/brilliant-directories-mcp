# BD API — Member ↔ Sub Category Links (rel_services) Endpoints

**Tools:** `listMemberSubCategoryLinks`, `getMemberSubCategoryLink`, `createMemberSubCategoryLink`, `updateMemberSubCategoryLink`, `deleteMemberSubCategoryLink`
**Underlying endpoint:** `/api/v2/rel_services/*`
**BD table:** `rel_services`
**Primary key:** `rel_id`

_Source: https://support.brilliantdirectories.com/support/solutions/articles/12000108071_

Join-table rows linking a member (`user_id`) to a Sub Category (`service_id`) with per-link metadata: price, specialty flag, completion counter. This is LEVEL 3 of the member classification — use when the `users_data.services` CSV isn't rich enough.

## When to use this vs. `users_data.services` CSV

BD offers two ways to tag a member with Sub Categories:

| Method | Tool | When to use |
|---|---|---|
| **Simple:** CSV on the user record | `updateUser` with `services="<id1>,<id2>"` | You just need "this member is tagged with these Sub Categories." No price/specialty metadata. |
| **Rich:** Join-table rows | `createMemberSubCategoryLink` + friends | You need per-link `avg_price`, `specialty`, `num_completed`, or `date` attached to each member↔subcategory relationship. |

Both coexist. Many sites use only the CSV field. The join table is common on sites that charge different rates per-service or display "specialty" badges.

## Endpoints

### List
`GET /api/v2/rel_services/get` — paginated. Filter by `user_id` or `service_id` to scope.

### Get Single
`GET /api/v2/rel_services/get/{rel_id}`

### Create
`POST /api/v2/rel_services/create`
- **Required:** `user_id`, `service_id`
- **Optional:** `date` (YYYYMMDDHHmmss), `avg_price` (decimal), `specialty` (0/1), `num_completed` (int)

### Update
`PUT /api/v2/rel_services/update`
- **Required:** `rel_id`
- **Optional:** `avg_price`, `specialty`, `num_completed`, `date`

### Delete
`DELETE /api/v2/rel_services/delete`
- **Required:** `rel_id`
- Note: does NOT remove the `service_id` from the member's `users_data.services` CSV if it's listed there. Update that separately via `updateUser` if needed.

## Schema

| Field | Type | Description |
|---|---|---|
| `rel_id` | integer | Primary key (read-only) |
| `user_id` | integer | Member (from `listUsers`) |
| `service_id` | integer | Sub Category (from `listSubCategories`) |
| `date` | string | YYYYMMDDHHmmss timestamp |
| `avg_price` | decimal | Member's price for this Sub Category |
| `num_completed` | integer | Completion counter |
| `specialty` | integer | `0`=No, `1`=Yes (shows specialty badge on profile) |
