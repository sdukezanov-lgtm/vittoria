-- CreateEnum
CREATE TYPE "OrderStage" AS ENUM ('preparation_for_production', 'detailing', 'materials_arrival', 'production', 'transfer_to_warehouse', 'completeness_check', 'ready_for_delivery');

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL,
    "amocrm_deal_id" INTEGER NOT NULL,
    "contract_number" TEXT,
    "client_user_id" UUID NOT NULL,
    "partner_user_id" UUID,
    "product_name" TEXT,
    "total_amount" DECIMAL(12,2),
    "prepayment_amount" DECIMAL(12,2),
    "balance_due" DECIMAL(12,2),
    "current_stage" "OrderStage" NOT NULL DEFAULT 'preparation_for_production',
    "progress_percent" INTEGER NOT NULL DEFAULT 0,
    "service_phone" TEXT,
    "partner_services" JSONB NOT NULL DEFAULT '[]',
    "last_admin_comment" TEXT,
    "amocrm_synced_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_stage_history" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "stage" "OrderStage" NOT NULL,
    "progress_percent" INTEGER NOT NULL,
    "comment" TEXT,
    "changed_by_user_id" UUID,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_stage_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "orders_amocrm_deal_id_key" ON "orders"("amocrm_deal_id");

-- CreateIndex
CREATE INDEX "orders_client_user_id_idx" ON "orders"("client_user_id");

-- CreateIndex
CREATE INDEX "orders_partner_user_id_idx" ON "orders"("partner_user_id");

-- CreateIndex
CREATE INDEX "order_stage_history_order_id_changed_at_idx" ON "order_stage_history"("order_id", "changed_at" DESC);

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_client_user_id_fkey" FOREIGN KEY ("client_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_partner_user_id_fkey" FOREIGN KEY ("partner_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_stage_history" ADD CONSTRAINT "order_stage_history_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
