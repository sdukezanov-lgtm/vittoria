# AmoCRM Custom Field Mapping

The VITTORIA HOME backend reads from / writes to a small set of custom fields on AmoCRM **leads** (sales / deals). These IDs are environment-specific — replace the placeholders with the real numeric IDs from your AmoCRM account (Settings → Account → Field IDs panel).

| Env var | DB column | Type in AmoCRM | Direction | Notes |
|---|---|---|---|---|
| `AMOCRM_FIELD_STAGE_ID` | `orders.current_stage` | select (7 options) | bidirectional | Select options must match the 7 `OrderStage` enum values exactly. |
| `AMOCRM_FIELD_PROGRESS_ID` | `orders.progress_percent` | number | bidirectional | 0..100 integer. |
| `AMOCRM_FIELD_ADMIN_COMMENT_ID` | `orders.last_admin_comment` | text | bidirectional | Free text. |
| `AMOCRM_FIELD_PREPAYMENT_ID` | `orders.prepayment_amount` | number | inbound | We do not write this back. |
| `AMOCRM_FIELD_PARTNER_USER_ID` | `orders.partner_user_id` | number | inbound | Our internal user UUID is stored as a string in AmoCRM — see note below. |
| `AMOCRM_FIELD_PARTNER_SERVICES_ID` | `orders.partner_services` | text (JSON) | inbound | Serialized JSON array; see spec section 10.3 for format. |

## Partner user reference

`AMOCRM_FIELD_PARTNER_USER_ID` is intentionally stored as a string in AmoCRM (UUIDs aren't valid AmoCRM numbers). The inbound sync resolves it to a User UUID via `prisma.user.findUnique({ where: { id } })`. If not found, the order is created without a partner.

## Lead → Order field mapping (top-level)

| AmoCRM field | DB column |
|---|---|
| `lead.name` | `orders.product_name` |
| `lead.custom_fields_values[contract_number]`* | `orders.contract_number` |
| `lead.price` | `orders.total_amount` |
| `lead._embedded.contacts[0].id` | resolved to `users.amocrm_contact_id` → `orders.client_user_id` |

*If you store `contract_number` in a custom field, add an env var following the pattern above. For Plan 2 we read it from `lead.name` if not configured.

## Discovering field IDs in your AmoCRM account

1. Log into AmoCRM as an admin.
2. Settings → Pipelines → click on the pipeline → Fields tab.
3. Each custom field has a numeric ID shown next to its name.
4. Copy the IDs into your `.env` (production) or `.env.test` (CI).
