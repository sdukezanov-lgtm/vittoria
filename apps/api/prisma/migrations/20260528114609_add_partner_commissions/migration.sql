-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('pending', 'approved', 'paid');

-- CreateTable
CREATE TABLE "partner_commissions" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "partner_user_id" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "payout_status" "PayoutStatus" NOT NULL DEFAULT 'pending',
    "paid_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "partner_commissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "partner_commissions_partner_user_id_idx" ON "partner_commissions"("partner_user_id");

-- CreateIndex
CREATE INDEX "partner_commissions_order_id_idx" ON "partner_commissions"("order_id");

-- AddForeignKey
ALTER TABLE "partner_commissions" ADD CONSTRAINT "partner_commissions_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_commissions" ADD CONSTRAINT "partner_commissions_partner_user_id_fkey" FOREIGN KEY ("partner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
