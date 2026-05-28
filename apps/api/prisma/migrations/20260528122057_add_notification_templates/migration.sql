-- CreateTable
CREATE TABLE "notification_templates" (
    "event" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_templates_pkey" PRIMARY KEY ("event")
);

-- Seed default templates (matches the hardcoded strings from Plan 4/5)
INSERT INTO "notification_templates" ("event", "title", "body", "updated_at") VALUES
  ('order.stage.changed',    'VITTORIA HOME', '{{order}}: новый этап — «{{stageLabel}}».',                   NOW()),
  ('order.progress.changed', 'VITTORIA HOME', '{{order}}: готовность {{percent}}%.',                          NOW()),
  ('order.ready',            'VITTORIA HOME', '{{order}} готов к передаче. Сервисный отдел свяжется с вами.', NOW()),
  ('chat.reply.received',    'VITTORIA HOME', '{{order}}: новый ответ от сервиса.{{previewTail}}',            NOW());
