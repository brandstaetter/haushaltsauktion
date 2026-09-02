-- AlterEnum
ALTER TYPE "HistoryEventType" ADD VALUE 'STREAK_BONUS_AWARDED';

-- AlterEnum
ALTER TYPE "PointTransactionType" ADD VALUE 'STREAK_BONUS';

-- AlterTable
ALTER TABLE "household_members" ADD COLUMN     "streak_bonus_paid_date" TEXT,
ADD COLUMN     "streak_last_active_date" TEXT,
ADD COLUMN     "streak_length" INTEGER NOT NULL DEFAULT 0;
