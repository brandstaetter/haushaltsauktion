-- CreateTable
CREATE TABLE "push_outbox_items" (
    "id" TEXT NOT NULL,
    "household_id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "task_instance_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_outbox_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "push_outbox_items_created_at_idx" ON "push_outbox_items"("created_at");

-- CreateIndex
CREATE INDEX "push_outbox_items_household_id_idx" ON "push_outbox_items"("household_id");

-- CreateIndex
CREATE INDEX "push_outbox_items_member_id_idx" ON "push_outbox_items"("member_id");

-- CreateIndex
CREATE INDEX "push_outbox_items_task_instance_id_idx" ON "push_outbox_items"("task_instance_id");

-- AddForeignKey
ALTER TABLE "push_outbox_items" ADD CONSTRAINT "push_outbox_items_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_outbox_items" ADD CONSTRAINT "push_outbox_items_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "household_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_outbox_items" ADD CONSTRAINT "push_outbox_items_task_instance_id_fkey" FOREIGN KEY ("task_instance_id") REFERENCES "task_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;
