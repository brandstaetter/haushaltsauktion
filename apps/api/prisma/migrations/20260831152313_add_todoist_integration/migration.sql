-- CreateEnum
CREATE TYPE "IntegrationProvider" AS ENUM ('TODOIST');

-- CreateEnum
CREATE TYPE "IntegrationStatus" AS ENUM ('ACTIVE', 'INVALID_CREDENTIALS', 'DISABLED');

-- CreateEnum
CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'DEAD', 'SKIPPED', 'ORPHANED');

-- CreateEnum
CREATE TYPE "OutboxOperation" AS ENUM ('CREATE_TASK', 'CLOSE_TASK');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'INTEGRATION_CONNECTED';
ALTER TYPE "AuditAction" ADD VALUE 'INTEGRATION_DISCONNECTED';
ALTER TYPE "AuditAction" ADD VALUE 'INTEGRATION_SETTINGS_UPDATED';

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'INTEGRATION_FAILED';

-- CreateTable
CREATE TABLE "member_integrations" (
    "id" TEXT NOT NULL,
    "household_id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "provider" "IntegrationProvider" NOT NULL,
    "status" "IntegrationStatus" NOT NULL DEFAULT 'ACTIVE',
    "token_ciphertext" BYTEA,
    "token_iv" BYTEA,
    "token_auth_tag" BYTEA,
    "token_key_version" INTEGER,
    "token_hint" TEXT,
    "project_id" TEXT,
    "project_name" TEXT,
    "triggers" JSONB NOT NULL DEFAULT '{"VOLUNTARY":true,"RANDOM":true}',
    "last_success_at" TIMESTAMP(3),
    "last_error_at" TIMESTAMP(3),
    "last_error_code" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "member_integrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_outbox" (
    "id" TEXT NOT NULL,
    "household_id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "integration_id" TEXT NOT NULL,
    "operation" "OutboxOperation" NOT NULL,
    "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
    "task_instance_id" TEXT NOT NULL,
    "assignment_id" TEXT NOT NULL,
    "enqueue_key" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_error_code" TEXT,
    "last_error_body" TEXT,
    "external_task_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settled_at" TIMESTAMP(3),
    "member_notified_at" TIMESTAMP(3),

    CONSTRAINT "integration_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_task_links" (
    "id" TEXT NOT NULL,
    "household_id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "integration_id" TEXT NOT NULL,
    "task_instance_id" TEXT NOT NULL,
    "assignment_id" TEXT NOT NULL,
    "external_task_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMP(3),
    "close_reason" TEXT,

    CONSTRAINT "integration_task_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "member_integrations_household_id_status_idx" ON "member_integrations"("household_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "member_integrations_household_id_member_id_provider_key" ON "member_integrations"("household_id", "member_id", "provider");

-- CreateIndex
CREATE INDEX "integration_outbox_household_id_status_next_attempt_at_idx" ON "integration_outbox"("household_id", "status", "next_attempt_at");

-- CreateIndex
CREATE INDEX "integration_outbox_household_id_settled_at_idx" ON "integration_outbox"("household_id", "settled_at");

-- CreateIndex
CREATE INDEX "integration_outbox_integration_id_idx" ON "integration_outbox"("integration_id");

-- CreateIndex
CREATE INDEX "integration_outbox_task_instance_id_idx" ON "integration_outbox"("task_instance_id");

-- CreateIndex
CREATE INDEX "integration_task_links_task_instance_id_idx" ON "integration_task_links"("task_instance_id");

-- CreateIndex
CREATE UNIQUE INDEX "integration_task_links_household_id_assignment_id_key" ON "integration_task_links"("household_id", "assignment_id");

-- AddForeignKey
ALTER TABLE "member_integrations" ADD CONSTRAINT "member_integrations_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_integrations" ADD CONSTRAINT "member_integrations_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "household_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_outbox" ADD CONSTRAINT "integration_outbox_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_outbox" ADD CONSTRAINT "integration_outbox_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "household_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_outbox" ADD CONSTRAINT "integration_outbox_integration_id_fkey" FOREIGN KEY ("integration_id") REFERENCES "member_integrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_outbox" ADD CONSTRAINT "integration_outbox_task_instance_id_fkey" FOREIGN KEY ("task_instance_id") REFERENCES "task_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_task_links" ADD CONSTRAINT "integration_task_links_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_task_links" ADD CONSTRAINT "integration_task_links_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "household_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_task_links" ADD CONSTRAINT "integration_task_links_integration_id_fkey" FOREIGN KEY ("integration_id") REFERENCES "member_integrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_task_links" ADD CONSTRAINT "integration_task_links_task_instance_id_fkey" FOREIGN KEY ("task_instance_id") REFERENCES "task_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- Was die Prisma-DSL nicht ausdrücken kann: PARTIELLE Indizes.
-- Vorbild und Präzedenz: 20260830000100_constraints/migration.sql
-- ("pt_one_reward_per_assignment", "ta_one_active_assignment_per_instance").
-- ─────────────────────────────────────────────────────────────────────────────


-- Doppeltes Einreihen derselben Arbeit verhindern, SOLANGE SIE LÄUFT.
--
-- Der Geltungsbereich ist der eigentliche Punkt: Endzustandszeilen
-- (SENT/DEAD/SKIPPED/ORPHANED) sind Historie, keine Warteschlange, und dürfen
-- einen erneuten Vorschlag NICHT blockieren. Ein globales UNIQUE über
-- (household_id, enqueue_key) hat genau das getan und damit die Selbstheilung
-- des Reconcilers zerstört: nach einem erschöpften Retry-Ladder wurde jeder
-- weitere Vorschlag von `ON CONFLICT DO NOTHING` stillschweigend verworfen.
--
-- Unterdrückung kommt aus der URSACHE (§6: entzogene Lebensfähigkeit), nicht
-- aus der Leiche. Die einzige Ausnahme ist ORPHANED, dessen Ursache unumkehrbar
-- ist — und die wird im Reconciler geprüft, nicht hier.
CREATE UNIQUE INDEX "integration_outbox_live_key"
  ON "integration_outbox" ("household_id", "enqueue_key")
  WHERE "status" IN ('PENDING', 'FAILED');


-- Trägt die Ist-Abfrage des Reconcilers: WHERE household_id = $1 AND closed_at IS NULL.
-- Als Vollindex wäre er für dieses Prädikat unselektiv.
CREATE INDEX "integration_task_links_open"
  ON "integration_task_links" ("household_id", "integration_id")
  WHERE "closed_at" IS NULL;
