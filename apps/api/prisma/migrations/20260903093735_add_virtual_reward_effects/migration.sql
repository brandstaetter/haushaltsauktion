-- CreateEnum
CREATE TYPE "RewardKind" AS ENUM ('MANUAL_FULFILLMENT', 'VIRTUAL_EFFECT');

-- CreateEnum
CREATE TYPE "EffectType" AS ENUM ('IMMUNITY', 'MULTIPLIER');

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'MEMBER_EFFECT_ACTIVATED';

-- AlterTable
ALTER TABLE "reward_definitions" ADD COLUMN     "effect_charges" INTEGER,
ADD COLUMN     "effect_duration_minutes" INTEGER,
ADD COLUMN     "effect_multiplier" DOUBLE PRECISION,
ADD COLUMN     "effect_type" "EffectType",
ADD COLUMN     "kind" "RewardKind" NOT NULL DEFAULT 'MANUAL_FULFILLMENT';

-- CreateTable
CREATE TABLE "member_effects" (
    "id" TEXT NOT NULL,
    "household_id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "type" "EffectType" NOT NULL,
    "reward_redemption_id" TEXT NOT NULL,
    "multiplier_value" DOUBLE PRECISION,
    "charges_remaining" INTEGER,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "consumed_at" TIMESTAMP(3),

    CONSTRAINT "member_effects_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "member_effects_household_id_member_id_type_expires_at_idx" ON "member_effects"("household_id", "member_id", "type", "expires_at");

-- AddForeignKey
ALTER TABLE "member_effects" ADD CONSTRAINT "member_effects_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_effects" ADD CONSTRAINT "member_effects_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "household_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_effects" ADD CONSTRAINT "member_effects_reward_redemption_id_fkey" FOREIGN KEY ("reward_redemption_id") REFERENCES "reward_redemptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
