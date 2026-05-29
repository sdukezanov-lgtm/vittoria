# VITTORIA HOME — как выложить на сервер (деплой) и в магазины

Что нужно, чтобы система работала «вживую» в интернете: сервер для backend + веб-панели, и публикация мобильных приложений. Простыми словами + конкретные шаги.

> Это этап DevOps. Я могу пройти его с вами по шагам — здесь общая карта и список того, что понадобится.

---

## Что из чего состоит (что разворачиваем)

| Компонент | Что это | Куда |
|---|---|---|
| **API (backend)** | сервер NestJS (REST + чат) | сервер/контейнер, домен `api.…` |
| **Worker** | фоновые задачи (синхронизация amoCRM, уведомления) | тот же сервер/контейнер |
| **Веб-панель** | статический сайт React (admin + партнёр) | домен `admin.…` (nginx/CDN) |
| **PostgreSQL** | база данных | managed-БД (рекомендуется) |
| **Redis** | кэш/очереди | managed-Redis |
| **Object Storage (S3)** | фото из чата | Yandex Object Storage (S3-совместимое) |

**Рекомендуемый хостинг:** Yandex Cloud (РФ, 152-ФЗ, близко к SMS/push) — Managed PostgreSQL + Managed Redis + Object Storage + сервер (VM или Managed Kubernetes). Подойдёт и обычный VPS с Docker для старта.

---

## Часть 1. Сервер (backend + веб-панель)

### Что понадобится
- Сервер (VPS или облако) с Docker.
- 2 домена (или поддомена): например `api.vittoria.app` и `admin.vittoria.app`, с настроенными DNS на сервер.
- TLS-сертификаты (бесплатно через Let's Encrypt — например, обратный прокси Caddy/Traefik/nginx + certbot).
- Managed PostgreSQL 16 и Redis 7 (или контейнеры, но для прод лучше managed с бэкапами).
- Бакет Object Storage (S3) + ключи доступа.

### Шаги
1. **Поднять БД и Redis** (managed) — получить строки подключения `DATABASE_URL`, `REDIS_URL`.
2. **Создать бакет** Object Storage (например `vittoria-chat`), получить `S3_ENDPOINT`, ключи, регион.
3. **Подготовить production-конфиг** (переменные окружения сервера — НЕ в Git, в защищённом хранилище):
   ```
   NODE_ENV=production
   PORT=3000
   DATABASE_URL=postgresql://…           # managed Postgres
   REDIS_URL=redis://…                    # managed Redis
   JWT_SECRET=<длинная случайная строка ≥32>
   JWT_ACCESS_TTL_SEC=900
   JWT_REFRESH_TTL_SEC=2592000
   OTP_TTL_SEC=300
   OTP_MAX_ATTEMPTS=5
   OTP_REQUEST_RATE_LIMIT_PER_MIN=1
   CORS_ORIGINS=https://admin.vittoria.app
   # amoCRM (уже есть)
   AMOCRM_BASE_URL=https://vittoriaamo.amocrm.ru
   AMOCRM_CLIENT_MODE=http
   AMOCRM_ACCESS_TOKEN=<долгосрочный токен>
   AMOCRM_WEBHOOK_SECRET=<секрет для проверки вебхуков ≥16>
   # SMS (когда будут)
   SMS_PROVIDER_MODE=smsc
   SMSC_LOGIN=…
   SMSC_PASSWORD=…
   SMSC_SENDER=…
   # Object Storage (S3)
   S3_ENDPOINT=https://storage.yandexcloud.net
   S3_REGION=ru-central1
   S3_ACCESS_KEY=…
   S3_SECRET_KEY=…
   S3_BUCKET=vittoria-chat
   # Push (для мобильных уведомлений)
   PUSH_PROVIDER_MODE=real
   FCM_PROJECT_ID=… FCM_CLIENT_EMAIL=… FCM_PRIVATE_KEY=…
   APNS_KEY_ID=… APNS_TEAM_ID=… APNS_PRIVATE_KEY=… APNS_BUNDLE_ID=app.vittoria.client
   ```
4. **Применить миграции БД:** `pnpm --filter @vittoria/api prisma:migrate:deploy`.
5. **Собрать и запустить API:** `pnpm --filter @vittoria/api build` → запустить `node dist/main.js` (в контейнере Docker; рестарт-политика always). Worker запускается тем же кодом (фоновые задачи внутри процесса).
6. **Собрать веб-панель:** `pnpm --filter @vittoria/admin build` → раздать папку `apps/admin/dist` через nginx/CDN на `admin.vittoria.app`. Указать боевой адрес API через `VITE_API_BASE_URL=https://api.vittoria.app/api/v1` при сборке.
7. **Прокси + HTTPS:** обратный прокси (Caddy/Traefik/nginx) терминирует TLS и проксирует `api.…` → контейнер API, `admin.…` → статика.
8. **Вебхуки amoCRM:** в amoCRM (Настройки → Интеграции → ваша интеграция → Вебхуки) добавить адрес `https://api.vittoria.app/api/v1/amocrm/webhooks`. Тогда изменения сделок будут прилетать мгновенно (без него работает запасная синхронизация раз в 15 мин).

### Проверка после деплоя
- `https://api.vittoria.app/api/v1/healthz` → `{"status":"ok"}`.
- Вход в `https://admin.vittoria.app` по телефону админа (реальная SMS, если включён SMSC).
- Двинуть тестовую сделку в воронке «VITTORIA HOME» → проверить, что заказ появился/обновился.

---

## Часть 2. Мобильные приложения в Google Play и App Store

Подробные пошаговые инструкции — в **`docs/mobile-build-and-publish.md`**. Кратко:
- **Android:** Android Studio → собрать подписанный AAB → Google Play Console ($25) → загрузить → заполнить карточку → на проверку.
- **iOS:** нужен **Mac** + Xcode → `xcodegen generate` → Archive → App Store Connect (Apple Developer $99/год) → заполнить карточку → на ревью.
- Перед сборкой указать боевой адрес API (`https://api.vittoria.app/api/v1`).
- Для уведомлений настроить ключи **FCM** (Android) и **APNs** (iOS).

---

## Порядок запуска «под ключ» (рекомендация)
1. Поднять сервер + БД/Redis/Storage, выложить backend + веб-панель, HTTPS. ✅ можно начинать сейчас (amoCRM-токен уже есть).
2. Добавить SMSC-доступы → включить реальные SMS.
3. Прописать вебхук amoCRM на боевой адрес → мгновенная синхронизация.
4. Собрать и опубликовать мобильные приложения (Mac для iOS), настроить push-ключи.
5. Closed beta на 10–20 клиентах → правки → публичный релиз.

Готов вести этот процесс пошагово.
