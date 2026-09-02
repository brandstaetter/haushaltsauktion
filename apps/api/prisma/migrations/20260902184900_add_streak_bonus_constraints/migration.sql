-- Split from 20260902184836_add_streak_bonus: Postgres requires a new enum
-- value to be committed before it can be referenced in a CHECK constraint
-- ("unsafe use of new value ... New enum values must be committed before
-- they can be used"), so this waits for the previous migration's own
-- transaction to commit first.
--
-- §44-Erweiterung (Architektur §1.5): dieselben CHECKs wie für
-- VOLUNTARY_TASK_REWARD in 20260830000100_constraints, gespiegelt für
-- STREAK_BONUS — ein Streak-Bonus zahlt immer Punkte, hängt immer an einer
-- freiwilligen Zuweisung und höchstens einer je Zuweisung.
ALTER TABLE "point_transactions"
  ADD CONSTRAINT "pt_streak_bonus_gives_points"
  CHECK ("type" <> 'STREAK_BONUS' OR "amount" > 0);

ALTER TABLE "point_transactions"
  ADD CONSTRAINT "pt_streak_bonus_only_for_voluntary"
  CHECK ("type" <> 'STREAK_BONUS'
         OR ("assignment_kind" IS NOT NULL AND "assignment_kind" = 'VOLUNTARY'));

ALTER TABLE "point_transactions"
  ADD CONSTRAINT "pt_streak_bonus_has_assignment"
  CHECK ("type" <> 'STREAK_BONUS' OR "task_assignment_id" IS NOT NULL);

CREATE UNIQUE INDEX "pt_one_streak_bonus_per_assignment"
  ON "point_transactions" ("task_assignment_id")
  WHERE "type" = 'STREAK_BONUS';
