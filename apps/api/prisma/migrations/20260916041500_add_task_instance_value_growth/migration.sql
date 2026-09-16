-- Intake "time-based-value-growth": anchor for the rising market value of an
-- AVAILABLE instance.
--
-- Deliberately NULL for every existing row rather than backfilled to now():
-- the growth sweep seeds the anchor lazily on first sight of an AVAILABLE
-- instance without one, so tasks already on the market start their clock at
-- deploy time instead of being retroactively credited for however long they
-- have been sitting there. NULL also carries the "finished growing" meaning
-- once an instance reaches valueIncrease.maximumValue.
ALTER TABLE "task_instances" ADD COLUMN "value_growth_at" TIMESTAMP(3);

-- Serves the growth sweep's "AVAILABLE instances whose clock is due" query.
CREATE INDEX "task_instances_household_id_status_value_growth_at_idx"
  ON "task_instances"("household_id", "status", "value_growth_at");
