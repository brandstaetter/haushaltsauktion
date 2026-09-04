-- AlterTable
ALTER TABLE "task_definitions" ADD COLUMN     "min_admin_slots" INTEGER,
ADD COLUMN     "required_role" "MemberRole";

-- CreateTable
CREATE TABLE "task_definition_preferred_assignees" (
    "task_definition_id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "household_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_definition_preferred_assignees_pkey" PRIMARY KEY ("task_definition_id","member_id")
);

-- CreateIndex
CREATE INDEX "task_definition_preferred_assignees_household_id_member_id_idx" ON "task_definition_preferred_assignees"("household_id", "member_id");

-- AddForeignKey
ALTER TABLE "task_definition_preferred_assignees" ADD CONSTRAINT "task_definition_preferred_assignees_task_definition_id_fkey" FOREIGN KEY ("task_definition_id") REFERENCES "task_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_definition_preferred_assignees" ADD CONSTRAINT "task_definition_preferred_assignees_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "household_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;
