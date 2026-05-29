# Mobile Client Apps — API Contract & Screen Spec

**Date:** 2026-05-29
**Scope:** Native client apps for end customers — iOS (Swift/SwiftUI, MVVM) and Android (Kotlin/Jetpack Compose, MVVM). Both consume the existing REST API. Role: `client` only.

> **IMPORTANT (environment note):** This source code is authored on a Windows machine and **cannot be compiled, run, or published here**. iOS requires macOS + Xcode; Android requires Android Studio/SDK. The code is structured to be opened and built later on the proper toolchain. It is **unverified** until then.

---

## Base & auth

- Base URL (dev): `http://10.0.2.2:3000/api/v1` (Android emulator → host) / `http://localhost:3000/api/v1` (iOS simulator). Configurable; prod `https://api.vittoria.app/api/v1`.
- Auth: SMS-OTP. Access token (JWT, ~15 min) in `Authorization: Bearer`. Refresh token (~30 d) stored securely (Keychain / EncryptedSharedPreferences). On 401 → call refresh once → retry; if refresh fails → log out.
- Error envelope: `{ "error": { "code", "message" }, "request_id" }`.

### Auth endpoints (public)
- `POST /auth/request-code` body `{ phone }` → `{ retry_after_sec }`. (phone must already exist server-side; created via amoCRM.)
- `POST /auth/verify-code` body `{ phone, code }` → `{ access_token, refresh_token, user: { id, phone, role } }`.
- `POST /auth/refresh` body `{ refresh_token }` → `{ access_token, refresh_token }`.
- `POST /auth/logout` (Bearer) → 204.

## Client endpoints (Bearer)
- `GET /me` → `{ id, phone, role, first_name, last_name, consent_accepted_at }`.
- `PATCH /me` body `{ first_name?, last_name?, city? }` → updated profile.
- `POST /me/consent` → 204.
- `DELETE /me` → 204 (152-ФЗ anonymization).
- `POST /me/push-tokens` body `{ platform: 'ios'|'android', token, device_id }` → token row.
- `DELETE /me/push-tokens/:id` → 204.
- `GET /orders` → `{ items: Order[] }` (the client's own orders).
- `GET /orders/:id` → `Order`.
- `GET /orders/:id/history` → `{ items: StageHistory[] }`.
- `GET /orders/:id/chat` → `{ id, order_id, created_at, unread_count }` (find-or-create the order's chat).
- `GET /chats/:id/messages?before=&limit=50` → `{ rows: Message[] }` (newest-first).
- `POST /chats/:id/messages` body `{ text?, attachment_ids? }` → `Message`.
- `PATCH /chats/:id/read` body `{ up_to_message_id }` → `{ updated }`.
- `GET /service/contact` → `{ phone, hours }`.

## DTO shapes
```
Order {
  id: string; amocrm_deal_id: number; contract_number: string|null; product_name: string|null;
  total_amount: string|null; prepayment_amount: string|null; balance_due: string|null;
  current_stage: OrderStage; progress_percent: number; service_phone: string|null;
  last_admin_comment: string|null;
  partner_services: { type: string; label?: string; date?: string; price?: number }[];
  created_at: string; updated_at: string;
}
OrderStage = 'preparation_for_production' | 'detailing' | 'materials_arrival' | 'production'
           | 'transfer_to_warehouse' | 'completeness_check' | 'ready_for_delivery'
StageHistory { id: string; stage: OrderStage; progress_percent: number; comment: string|null; changed_at: string }
Message { id; chat_id; sender_user_id; sender_role: 'client'|'admin'; text: string|null;
          attachments: { object_key; mime; size; url? }[]; read_at: string|null; created_at: string }
```

### Stage labels (RU)
```
preparation_for_production → Подготовка для производства
detailing                  → Деталировка
materials_arrival          → Поступление материалов на склад
production                 → Производство изделия
transfer_to_warehouse      → Передача готового изделия на склад
completeness_check         → Проверка комплектности товара
ready_for_delivery         → Готовность к передаче клиенту
```

---

## Screens (both platforms)

1. **Auth** — phone input (+7…) → "Получить код" → 4-digit code field → "Войти". On first login show a one-time consent screen → `POST /me/consent`.
2. **Home (main)** — the client's primary order: contract number, product, finances (стоимость/предоплата/остаток), current stage + progress bar (%), admin comment (if any), partner-services forecast (read-only list), "Чат с сервисом" button, service phone (tap → dial, from `/service/contact`). If multiple orders, a simple list to pick one.
3. **Stage history** — vertical timeline of the 7 stages with dates/comments from `/orders/:id/history`.
4. **Chat** — message list (cursor pagination, newest at bottom), text composer + send; admin messages left, client right; "В среднем отвечаем в течение 2 часов" hint. (Photo attach optional — can stub for first cut.)
5. **Profile** — name, phone (read-only), push toggle, logout, delete account (confirm dialog → `DELETE /me`).

## Architecture
- **iOS:** SwiftUI + MVVM. `APIClient` (URLSession async/await, Codable, Bearer + single refresh retry), `KeychainTokenStore`, `AuthStore: ObservableObject`, one `ObservableObject` view-model per screen, `NavigationStack` routing.
- **Android:** Jetpack Compose + MVVM. Retrofit + OkHttp (auth interceptor + Authenticator for refresh), Moshi/kotlinx-serialization DTOs, `EncryptedSharedPreferences` token store, Hilt or manual DI, `ViewModel` + `StateFlow` per screen, Compose Navigation.
- **Layout:** project dirs `apps/android/` (Gradle) and `apps/ios/` (SwiftUI sources + XcodeGen `project.yml` + README to generate the Xcode project, since a hand-written `.pbxproj` is unreliable).
