-- Multi-worker-tasks Phase 2 (.planning/architecture-multi-worker-tasks.md).
--
-- Phase 1 added `active_slot_key` as the intended replacement for
-- `active_for_instance_id`, but left the OLD sentinel's Phase-0 CHECK
-- constraint in place:
--
--   ta_active_sentinel_set_iff_active:
--     CHECK (("status" = 'ACTIVE') = ("active_for_instance_id" IS NOT NULL))
--
-- That constraint requires EVERY currently-ACTIVE row to carry a non-null
-- `active_for_instance_id` — which, combined with the column's
-- `@unique` index, makes a second concurrently-ACTIVE assignment on the same
-- instance a guaranteed 23514/23505 no matter what Phase 2's application code
-- writes into it. This was only discovered by actually exercising a
-- multi-slot volunteer against a real Postgres (see HANDOFF) — the
-- architecture doc's "Slot uniqueness" section did not account for it.
--
-- The fix keeps `active_for_instance_id` meaningful for the slot-0 holder
-- (today's single-slot case is 100% unchanged — EXACTLY(1) never has a
-- slotIndex other than 0) while allowing slotIndex > 0 rows to stay ACTIVE
-- with the sentinel left NULL. The new constraint drops the "ACTIVE implies
-- non-null" direction but keeps the reverse ("non-null implies ACTIVE and
-- matches this instance") — the direction that actually protects data
-- integrity (a CLOSED row can never still claim the sentinel).
ALTER TABLE "task_assignments"
  DROP CONSTRAINT "ta_active_sentinel_set_iff_active";

ALTER TABLE "task_assignments"
  DROP CONSTRAINT "ta_active_sentinel_matches_instance";

ALTER TABLE "task_assignments"
  ADD CONSTRAINT "ta_active_sentinel_matches_instance_when_set"
  CHECK ("active_for_instance_id" IS NULL
         OR ("status" = 'ACTIVE' AND "active_for_instance_id" = "task_instance_id"));

-- A second, independent blocker found the same way (a real 23505 against a
-- live Postgres, not a theoretical read of the schema): `20260830000100
-- _constraints` also added a partial UNIQUE index enforcing "at most ONE
-- ACTIVE assignment per INSTANCE" — coarser than per-slot, so it forbids a
-- second concurrently-ACTIVE row on the same instance regardless of
-- `slot_index`/`active_slot_key`. It predates slots entirely and was correct
-- for the single-worker world it was written in.
--
-- `active_slot_key`'s own UNIQUE index (Phase 1) already provides the
-- slot-aware equivalent of this guarantee: it is deterministically
-- `${taskInstanceId}:${slotIndex}` while ACTIVE, so two ACTIVE rows can never
-- share the same (instance, slot) pair. For EXACTLY(1) — every pre-existing
-- task, where slotIndex is always 0 — that is exactly as strict as the index
-- being dropped here. Nothing is weakened for the single-slot case; the
-- multi-slot case is exactly what this migration exists to unblock.
DROP INDEX "ta_one_active_assignment_per_instance";
