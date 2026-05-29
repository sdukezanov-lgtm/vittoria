# VITTORIA HOME — деплой на сервер (чтобы работало постоянно)

Подробный пошаговый рецепт: как поднять backend + веб-панель на сервере так, чтобы они работали круглосуточно, сами перезапускались и обновлялись. Рассчитано на одного человека без опыта DevOps (можно пройти со мной по шагам).

Готовые конфиги уже в репозитории:
- `apps/api/Dockerfile` — образ сервера (проверен сборкой).
- `apps/admin/Dockerfile` + `apps/admin/nginx.conf` — образ веб-панели.
- `infra/docker-compose.prod.yml` — весь стек одной командой.
- `infra/Caddyfile` — авто-HTTPS + маршрутизация по доменам.

---

## Что получится в итоге

```
Интернет ──HTTPS──▶ Caddy ─┬─▶ api.ВАШ-домен   → контейнер API (NestJS)
                           └─▶ admin.ВАШ-домен → контейнер веб-панели
                              + PostgreSQL + Redis + MinIO (хранилище фото)
```
Всё крутится в Docker на одном сервере, с автоперезапуском. Caddy сам получает и продлевает бесплатные TLS-сертификаты.

---

## Что понадобится (купить/завести)
1. **Сервер (VPS)** — Ubuntu 22.04, минимум 2 ГБ RAM (лучше 4). Подойдут Yandex Cloud, Timeweb, Selectel, Reg.ru и т.п. Для 152-ФЗ — российский провайдер.
2. **Домен** (например `vittoria.app`) и возможность создавать поддомены.
3. **Доступ по SSH** к серверу (логин/пароль или ключ — даёт провайдер).

> Рекомендация для России/152-ФЗ: Yandex Cloud (Managed PostgreSQL + Redis + Object Storage). Но для старта проще и дешевле — один VPS по этому рецепту.

---

## Часть 1. Деплой backend + веб-панели (по шагам)

### Шаг 1. Арендовать сервер
Закажите VPS с Ubuntu 22.04. Получите его **IP-адрес** и доступ по SSH. Подключитесь:
```
ssh root@IP-АДРЕС-СЕРВЕРА
```

### Шаг 2. Настроить домены (DNS)
В панели вашего домена создайте две **A-записи**, обе на IP сервера:
- `api.vittoria.app` → IP
- `admin.vittoria.app` → IP

(Подождите 10–30 мин, пока DNS обновится.)

### Шаг 3. Установить Docker на сервер
На сервере выполните:
```
curl -fsSL https://get.docker.com | sh
```
Проверка: `docker --version` и `docker compose version`.

### Шаг 4. Загрузить проект на сервер
```
apt-get install -y git
git clone <URL-вашего-репозитория> /opt/vittoria
cd /opt/vittoria
```
(URL репозитория — из GitHub, кнопка Code → HTTPS.)

### Шаг 5. Заполнить секреты `infra/.env.prod`
Создайте файл `infra/.env.prod` (он не в Git). Пример — замените значения на свои:
```
# --- база/хранилище (для контейнеров) ---
POSTGRES_USER=vittoria
POSTGRES_PASSWORD=<придумайте_длинный_пароль>
POSTGRES_DB=vittoria
S3_ACCESS_KEY=<придумайте_ключ>
S3_SECRET_KEY=<придумайте_секрет>

# --- адрес API для сборки веб-панели ---
ADMIN_API_BASE_URL=https://api.vittoria.app/api/v1

# --- конфиг сервера (API) ---
NODE_ENV=production
PORT=3000
DATABASE_URL=postgresql://vittoria:<тот_же_пароль>@postgres:5432/vittoria
REDIS_URL=redis://redis:6379
JWT_SECRET=<случайная_строка_минимум_32_символа>
JWT_ACCESS_TTL_SEC=900
JWT_REFRESH_TTL_SEC=2592000
OTP_TTL_SEC=300
OTP_MAX_ATTEMPTS=5
OTP_REQUEST_RATE_LIMIT_PER_MIN=1
CORS_ORIGINS=https://admin.vittoria.app

# --- amoCRM (уже есть) ---
AMOCRM_BASE_URL=https://vittoriaamo.amocrm.ru
AMOCRM_CLIENT_MODE=http
AMOCRM_ACCESS_TOKEN=<долгосрочный_токен>
AMOCRM_WEBHOOK_SECRET=<случайная_строка_минимум_16>

# --- хранилище фото (MinIO в этом же стеке) ---
S3_ENDPOINT=http://minio:9000
S3_REGION=ru-central1
S3_BUCKET=vittoria-chat

# --- SMS (когда будут доступы SMSC.ru) ---
SMS_PROVIDER_MODE=smsc
SMSC_LOGIN=<логин>
SMSC_PASSWORD=<пароль>
SMSC_SENDER=<имя_отправителя_если_есть>

# --- push (для мобильных, позже) ---
PUSH_PROVIDER_MODE=dev
```
> Пока нет SMSC — поставьте `SMS_PROVIDER_MODE=dev` (код будет в логах сервера, не в SMS). Пока нет push-ключей — `PUSH_PROVIDER_MODE=dev`.

### Шаг 6. Прописать свои домены в Caddy
Откройте `infra/Caddyfile` и замените `api.vittoria.app` / `admin.vittoria.app` на ваши поддомены.

### Шаг 7. Запустить весь стек
```
docker compose -f infra/docker-compose.prod.yml --env-file infra/.env.prod up -d --build
```
Это соберёт образы, поднимет PostgreSQL, Redis, MinIO, API, веб-панель и Caddy. **Миграции БД применяются автоматически** при старте API. Caddy сам выпустит HTTPS-сертификаты для ваших доменов.

### Шаг 8. Проверить, что работает
- `https://api.vittoria.app/api/v1/healthz` → `{"status":"ok"}`.
- Откройте `https://admin.vittoria.app` → форма входа.
- Заведите администратора (одноразово), подключившись к БД контейнера:
  ```
  docker compose -f infra/docker-compose.prod.yml exec postgres \
    psql -U vittoria -d vittoria -c \
    "INSERT INTO users (id, phone, role, created_at, updated_at) VALUES (gen_random_uuid(), '+7XXXXXXXXXX', 'admin', now(), now()) ON CONFLICT (phone) DO UPDATE SET role='admin';"
  ```
- Войдите по этому телефону (код придёт SMS, если включён SMSC; иначе — в логах: `docker compose -f infra/docker-compose.prod.yml logs api | grep DEV-SMS`).

### Шаг 9. Включить мгновенную синхронизацию amoCRM (вебхук)
В amoCRM → Настройки → Интеграции → ваша интеграция → раздел вебхуков: добавьте адрес
```
https://api.vittoria.app/api/v1/amocrm/webhooks
```
Теперь изменения сделок будут прилетать мгновенно (без него работает запасная синхронизация раз в 15 минут).

---

## Часть 2. Чтобы работало ПОСТОЯННО

- **Автоперезапуск:** во всех контейнерах стоит `restart: always` — при сбое или перезагрузке сервера они поднимаются сами. Сервер должен быть всегда включён (VPS работает 24/7).
- **Проверка статуса:** `docker compose -f infra/docker-compose.prod.yml ps` (все должны быть `running`).
- **Логи:** `docker compose -f infra/docker-compose.prod.yml logs -f api` (или `admin`, `caddy`).
- **Обновление версии** (после изменений в коде):
  ```
  cd /opt/vittoria && git pull
  docker compose -f infra/docker-compose.prod.yml --env-file infra/.env.prod up -d --build
  ```
- **Бэкап базы** (рекомендуется ежедневно, cron):
  ```
  docker compose -f infra/docker-compose.prod.yml exec -T postgres \
    pg_dump -U vittoria vittoria | gzip > /opt/backups/db-$(date +%F).sql.gz
  ```
- **Файрвол:** откройте только порты 80 и 443 (Caddy). Базу/Redis/MinIO наружу не публикуйте.
- **Мониторинг (по желанию):** подключить Sentry (ошибки) и UptimeRobot (пинг `/healthz`).

> Для повышенной надёжности позже можно вынести PostgreSQL и Redis в управляемые сервисы (Managed) с бэкапами и репликами, а фото — в Object Storage (S3) — тогда сервер становится «одноразовым», а данные защищены отдельно.

---

## Часть 3. Мобильные приложения
Чтобы люди скачивали приложение из Google Play и App Store — регистрация аккаунтов, оплата и публикация описаны отдельно: **`docs/store-accounts-and-publishing.md`**. Перед сборкой укажите боевой адрес API (`https://api.vittoria.app/api/v1`).

---

## Порядок «под ключ»
1. Сервер + домены + `docker compose up` (Часть 1) — уже можно: amoCRM-токен есть.
2. Добавить SMSC-доступы в `.env.prod` → реальные SMS.
3. Прописать вебхук amoCRM (Шаг 9).
4. Собрать и опубликовать мобильные приложения (Часть 3) + push-ключи.
5. Closed beta → правки → публичный релиз.

Готов пройти любой шаг вместе.
