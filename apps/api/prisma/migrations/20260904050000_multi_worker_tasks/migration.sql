-- Multi-worker-tasks Phase 1 (.planning/architecture-multi-worker-tasks.md).
-- Purely additive: every new column carries a default that reproduces
-- today's single-worker behaviour for all existing rows. Nothing reads or
-- writes these columns yet outside this migration's own backfill — that
-- starts in Phase 2.

-- CreateEnum
CREATE TYPE "WorkerCountMode" AS ENUM ('EXACTLY', 'AT_LEAST', 'AT_MOST');

-- AlterTable
ALTER TABLE "task_definitions" ADD COLUMN     "worker_count" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "worker_count_mode" "WorkerCountMode" NOT NULL DEFAULT 'EXACTLY';

-- AlterTable
ALTER TABLE "task_instances" ADD COLUMN     "active_slot_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "worker_count" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "worker_count_mode" "WorkerCountMode" NOT NULL DEFAULT 'EXACTLY';

-- AlterTable
ALTER TABLE "task_assignments" ADD COLUMN     "active_slot_key" TEXT,
ADD COLUMN     "slot_index" INTEGER NOT NULL DEFAULT 0;

-- Backfill: activeSlotKey replaces activeForInstanceId as the future ACTIVE
-- sentinel. All pre-existing rows backfill slot_index = 0 (the column
-- default above), so `${taskInstanceId}:0` is the equivalent activeSlotKey
-- for exactly the rows that currently hold a non-null active_for_instance_id
-- (i.e. the ones ACTIVE right now). Closed rows keep NULL, same as
-- active_for_instance_id.
UPDATE "task_assignments"
SET "active_slot_key" = "task_instance_id" || ':' || "slot_index"::text
WHERE "active_for_instance_id" IS NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "task_assignments_active_slot_key_key" ON "task_assignments"("active_slot_key");
