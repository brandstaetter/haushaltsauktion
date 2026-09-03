-- Copilot review follow-up (PR #51): pt_reward_redemption_id_matches_type
-- (20260903060000_add_reward_shop_constraints) only guarantees
-- reward_redemption_id is set iff type = 'REWARD_REDEMPTION' — it does not
-- forbid a REWARD_REDEMPTION row from ALSO carrying a task_instance_id /
-- task_assignment_id / assignment_kind. A redemption is not a task-related
-- transaction at all (§44 mirrored for the shop, Architektur §1.5), so this
-- closes that gap the same way pt_work_tx_has_assignment closes the
-- opposite one for VOLUNTARY_TASK_REWARD/BUYOUT: an ambiguous double-link
-- becomes a database error, not a possibility the application merely
-- promises never to create.
ALTER TABLE "point_transactions"
  ADD CONSTRAINT "pt_reward_redemption_excludes_task_link"
  CHECK ("type" <> 'REWARD_REDEMPTION'
         OR ("task_instance_id" IS NULL
             AND "task_assignment_id" IS NULL
             AND "assignment_kind" IS NULL));
