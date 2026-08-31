-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "MemberRole" AS ENUM ('MEMBER', 'ADMIN');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('DRAFT', 'AVAILABLE', 'ASSIGNED', 'COMPLETED', 'CANCELLED', 'PAUSED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "AssignmentKind" AS ENUM ('VOLUNTARY', 'RANDOM');

-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'BOUGHT_OUT', 'RELEASED', 'REVOKED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "AssignmentResponse" AS ENUM ('PENDING', 'ACCEPTED');

-- CreateEnum
CREATE TYPE "EligibilityMode" AS ENUM ('INCLUDED', 'EXCLUDED');

-- CreateEnum
CREATE TYPE "RecurrenceType" AS ENUM ('ONCE', 'DAILY', 'WEEKDAYS', 'WEEKLY', 'EVERY_N_DAYS', 'MONTHLY', 'MANUAL');

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('MEMBER', 'ADMIN', 'SYSTEM');

-- CreateEnum
CREATE TYPE "PointTransactionType" AS ENUM ('VOLUNTARY_TASK_REWARD', 'BUYOUT', 'MANUAL_ADJUSTMENT', 'DECAY', 'BONUS', 'PENALTY', 'CORRECTION');

-- CreateEnum
CREATE TYPE "HistoryEventType" AS ENUM ('CREATED', 'OFFERED', 'VOLUNTEERED', 'NO_VOLUNTEER', 'RANDOMLY_ASSIGNED', 'ASSIGNMENT_ACCEPTED', 'CONSTRAINT_RELAXED', 'NO_ELIGIBLE_CANDIDATES', 'BOUGHT_OUT', 'VALUE_INCREASED', 'RE_OFFERED', 'RELEASED', 'REVOKED', 'COMPLETED', 'POINTS_AWARDED', 'POINTS_CLAWED_BACK', 'VALUE_RESET', 'EXPIRED', 'CANCELLED', 'PAUSED', 'RESUMED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('TASK_AVAILABLE', 'TASK_ASSIGNED', 'TASK_DUE_SOON', 'TASK_VALUE_INCREASED', 'TASK_COMPLETED', 'ADMIN_NO_CANDIDATES');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('LOGIN_SUCCEEDED', 'LOGIN_FAILED', 'CONFIG_UPDATED', 'MEMBER_CREATED', 'MEMBER_UPDATED', 'MEMBER_DEACTIVATED', 'ROLE_CHANGED', 'RESTRICTIONS_UPDATED', 'POINTS_ADJUSTED', 'LEDGER_CACHE_REPAIRED', 'CATEGORY_CREATED', 'CATEGORY_UPDATED', 'TASK_DEFINITION_CREATED', 'TASK_DEFINITION_UPDATED', 'TASK_DEFINITION_ARCHIVED', 'INSTANCE_MATERIALIZED', 'INSTANCE_PUBLISHED', 'INSTANCE_CANCELLED', 'INSTANCE_PAUSED', 'INSTANCE_RESUMED', 'INSTANCE_EXPIRED', 'ASSIGNMENT_SWEEP_RUN', 'RANDOM_SELECTION', 'ASSIGNMENT_REVOKED', 'BUYOUT_EXECUTED', 'TASK_COMPLETED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "csrf_token_hash" TEXT NOT NULL,
    "active_household_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "ip_address" TEXT,
    "user_agent" TEXT,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "households" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Berlin',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "households_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "household_members" (
    "id" TEXT NOT NULL,
    "household_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "avatar_url" TEXT,
    "role" "MemberRole" NOT NULL DEFAULT 'MEMBER',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "points_cache" INTEGER NOT NULL DEFAULT 0,
    "max_random_assignments_per_week" INTEGER,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "household_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "member_absences" (
    "id" TEXT NOT NULL,
    "household_id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "member_absences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_categories" (
    "id" TEXT NOT NULL,
    "household_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color_hex" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "task_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "member_category_exclusions" (
    "household_id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "member_category_exclusions_pkey" PRIMARY KEY ("member_id","category_id")
);

-- CreateTable
CREATE TABLE "household_configurations" (
    "id" TEXT NOT NULL,
    "household_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "values" JSONB NOT NULL,
    "change_summary" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_member_id" TEXT,

    CONSTRAINT "household_configurations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_definitions" (
    "id" TEXT NOT NULL,
    "household_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category_id" TEXT,
    "base_value" INTEGER NOT NULL,
    "estimated_minutes" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "buyout_enabled" BOOLEAN NOT NULL DEFAULT true,
    "recurrence_type" "RecurrenceType" NOT NULL DEFAULT 'ONCE',
    "recurrence_interval" INTEGER,
    "recurrence_weekdays" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "recurrence_day_of_month" INTEGER,
    "recurrence_time_of_day" TEXT,
    "due_offset_minutes" INTEGER,
    "carried_value" INTEGER,
    "last_completed_at" TIMESTAMP(3),
    "next_due_at" TIMESTAMP(3),
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "task_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_definition_eligibility" (
    "task_definition_id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "household_id" TEXT NOT NULL,
    "mode" "EligibilityMode" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_definition_eligibility_pkey" PRIMARY KEY ("task_definition_id","member_id")
);

-- CreateTable
CREATE TABLE "task_instances" (
    "id" TEXT NOT NULL,
    "household_id" TEXT NOT NULL,
    "task_definition_id" TEXT NOT NULL,
    "status" "TaskStatus" NOT NULL DEFAULT 'DRAFT',
    "current_value" INTEGER NOT NULL,
    "base_value" INTEGER NOT NULL,
    "buyout_count" INTEGER NOT NULL DEFAULT 0,
    "scheduled_for" TIMESTAMP(3) NOT NULL,
    "due_at" TIMESTAMP(3),
    "offer_expires_at" TIMESTAMP(3),
    "published_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "completed_by_member_id" TEXT,
    "closed_at" TIMESTAMP(3),
    "config_version" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "task_instances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_assignments" (
    "id" TEXT NOT NULL,
    "household_id" TEXT NOT NULL,
    "task_instance_id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "kind" "AssignmentKind" NOT NULL,
    "status" "AssignmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "response" "AssignmentResponse" NOT NULL DEFAULT 'PENDING',
    "active_for_instance_id" TEXT,
    "value_at_assignment" INTEGER NOT NULL,
    "config_version" INTEGER NOT NULL,
    "selection_trace" JSONB,
    "buyout_cost" INTEGER,
    "value_before_buyout" INTEGER,
    "value_after_buyout" INTEGER,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "responded_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),

    CONSTRAINT "task_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "point_transactions" (
    "id" TEXT NOT NULL,
    "seq" BIGSERIAL NOT NULL,
    "household_id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "balance_before" INTEGER NOT NULL,
    "balance_after" INTEGER NOT NULL,
    "type" "PointTransactionType" NOT NULL,
    "previous_transaction_id" TEXT NOT NULL,
    "idempotency_key" TEXT,
    "task_instance_id" TEXT,
    "task_assignment_id" TEXT,
    "assignment_kind" "AssignmentKind",
    "description" TEXT,
    "initiator_member_id" TEXT,
    "initiator_type" "ActorType" NOT NULL DEFAULT 'MEMBER',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "point_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_history_events" (
    "id" TEXT NOT NULL,
    "seq" BIGSERIAL NOT NULL,
    "household_id" TEXT NOT NULL,
    "task_instance_id" TEXT NOT NULL,
    "assignment_id" TEXT,
    "member_id" TEXT,
    "type" "HistoryEventType" NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_history_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "household_id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "payload" JSONB NOT NULL,
    "task_instance_id" TEXT,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" TEXT NOT NULL,
    "seq" BIGSERIAL NOT NULL,
    "household_id" TEXT NOT NULL,
    "actor_type" "ActorType" NOT NULL,
    "actor_member_id" TEXT,
    "action" "AuditAction" NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT,
    "payload" JSONB NOT NULL,
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");

-- CreateIndex
CREATE INDEX "household_members_household_id_is_active_idx" ON "household_members"("household_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "household_members_household_id_user_id_key" ON "household_members"("household_id", "user_id");

-- CreateIndex
CREATE INDEX "member_absences_household_id_member_id_starts_at_ends_at_idx" ON "member_absences"("household_id", "member_id", "starts_at", "ends_at");

-- CreateIndex
CREATE UNIQUE INDEX "task_categories_household_id_name_key" ON "task_categories"("household_id", "name");

-- CreateIndex
CREATE INDEX "member_category_exclusions_household_id_category_id_idx" ON "member_category_exclusions"("household_id", "category_id");

-- CreateIndex
CREATE INDEX "household_configurations_household_id_version_idx" ON "household_configurations"("household_id", "version" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "household_configurations_household_id_version_key" ON "household_configurations"("household_id", "version");

-- CreateIndex
CREATE INDEX "task_definitions_household_id_is_active_next_due_at_idx" ON "task_definitions"("household_id", "is_active", "next_due_at");

-- CreateIndex
CREATE INDEX "task_definition_eligibility_household_id_member_id_idx" ON "task_definition_eligibility"("household_id", "member_id");

-- CreateIndex
CREATE INDEX "task_instances_household_id_status_offer_expires_at_idx" ON "task_instances"("household_id", "status", "offer_expires_at");

-- CreateIndex
CREATE INDEX "task_instances_household_id_status_due_at_idx" ON "task_instances"("household_id", "status", "due_at");

-- CreateIndex
CREATE INDEX "task_instances_task_definition_id_status_idx" ON "task_instances"("task_definition_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "task_assignments_active_for_instance_id_key" ON "task_assignments"("active_for_instance_id");

-- CreateIndex
CREATE INDEX "task_assignments_household_id_member_id_status_idx" ON "task_assignments"("household_id", "member_id", "status");

-- CreateIndex
CREATE INDEX "task_assignments_task_instance_id_status_idx" ON "task_assignments"("task_instance_id", "status");

-- CreateIndex
CREATE INDEX "task_assignments_household_id_kind_assigned_at_idx" ON "task_assignments"("household_id", "kind", "assigned_at");

-- CreateIndex
CREATE UNIQUE INDEX "task_assignments_id_kind_key" ON "task_assignments"("id", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "point_transactions_idempotency_key_key" ON "point_transactions"("idempotency_key");

-- CreateIndex
CREATE INDEX "point_transactions_household_id_member_id_seq_idx" ON "point_transactions"("household_id", "member_id", "seq");

-- CreateIndex
CREATE INDEX "point_transactions_household_id_created_at_idx" ON "point_transactions"("household_id", "created_at");

-- CreateIndex
CREATE INDEX "point_transactions_task_assignment_id_idx" ON "point_transactions"("task_assignment_id");

-- CreateIndex
CREATE UNIQUE INDEX "point_transactions_member_id_previous_transaction_id_key" ON "point_transactions"("member_id", "previous_transaction_id");

-- CreateIndex
CREATE INDEX "task_history_events_household_id_seq_idx" ON "task_history_events"("household_id", "seq");

-- CreateIndex
CREATE INDEX "task_history_events_task_instance_id_seq_idx" ON "task_history_events"("task_instance_id", "seq");

-- CreateIndex
CREATE INDEX "notifications_household_id_member_id_read_at_created_at_idx" ON "notifications"("household_id", "member_id", "read_at", "created_at");

-- CreateIndex
CREATE INDEX "audit_events_household_id_seq_idx" ON "audit_events"("household_id", "seq");

-- CreateIndex
CREATE INDEX "audit_events_household_id_action_created_at_idx" ON "audit_events"("household_id", "action", "created_at");

-- CreateIndex
CREATE INDEX "audit_events_household_id_entity_type_entity_id_idx" ON "audit_events"("household_id", "entity_type", "entity_id");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "household_members" ADD CONSTRAINT "household_members_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "household_members" ADD CONSTRAINT "household_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_absences" ADD CONSTRAINT "member_absences_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "household_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_categories" ADD CONSTRAINT "task_categories_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_category_exclusions" ADD CONSTRAINT "member_category_exclusions_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "household_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_category_exclusions" ADD CONSTRAINT "member_category_exclusions_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "task_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "household_configurations" ADD CONSTRAINT "household_configurations_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "household_configurations" ADD CONSTRAINT "household_configurations_created_by_member_id_fkey" FOREIGN KEY ("created_by_member_id") REFERENCES "household_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_definitions" ADD CONSTRAINT "task_definitions_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_definitions" ADD CONSTRAINT "task_definitions_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "task_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_definition_eligibility" ADD CONSTRAINT "task_definition_eligibility_task_definition_id_fkey" FOREIGN KEY ("task_definition_id") REFERENCES "task_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_definition_eligibility" ADD CONSTRAINT "task_definition_eligibility_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "household_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_instances" ADD CONSTRAINT "task_instances_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_instances" ADD CONSTRAINT "task_instances_task_definition_id_fkey" FOREIGN KEY ("task_definition_id") REFERENCES "task_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_instances" ADD CONSTRAINT "task_instances_completed_by_member_id_fkey" FOREIGN KEY ("completed_by_member_id") REFERENCES "household_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_instances" ADD CONSTRAINT "task_instances_household_id_config_version_fkey" FOREIGN KEY ("household_id", "config_version") REFERENCES "household_configurations"("household_id", "version") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_assignments" ADD CONSTRAINT "task_assignments_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_assignments" ADD CONSTRAINT "task_assignments_task_instance_id_fkey" FOREIGN KEY ("task_instance_id") REFERENCES "task_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_assignments" ADD CONSTRAINT "task_assignments_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "household_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_assignments" ADD CONSTRAINT "task_assignments_household_id_config_version_fkey" FOREIGN KEY ("household_id", "config_version") REFERENCES "household_configurations"("household_id", "version") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "point_transactions" ADD CONSTRAINT "point_transactions_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "point_transactions" ADD CONSTRAINT "point_transactions_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "household_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "point_transactions" ADD CONSTRAINT "point_transactions_initiator_member_id_fkey" FOREIGN KEY ("initiator_member_id") REFERENCES "household_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "point_transactions" ADD CONSTRAINT "point_transactions_task_instance_id_fkey" FOREIGN KEY ("task_instance_id") REFERENCES "task_instances"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "point_transactions" ADD CONSTRAINT "point_transactions_task_assignment_id_assignment_kind_fkey" FOREIGN KEY ("task_assignment_id", "assignment_kind") REFERENCES "task_assignments"("id", "kind") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_history_events" ADD CONSTRAINT "task_history_events_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_history_events" ADD CONSTRAINT "task_history_events_task_instance_id_fkey" FOREIGN KEY ("task_instance_id") REFERENCES "task_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_history_events" ADD CONSTRAINT "task_history_events_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "task_assignments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_history_events" ADD CONSTRAINT "task_history_events_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "household_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "household_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_task_instance_id_fkey" FOREIGN KEY ("task_instance_id") REFERENCES "task_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_member_id_fkey" FOREIGN KEY ("actor_member_id") REFERENCES "household_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

