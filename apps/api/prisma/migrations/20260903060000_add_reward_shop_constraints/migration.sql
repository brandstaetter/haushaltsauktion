-- Split from 20260903055947_add_reward_shop: Postgres requires a new enum
-- value to be committed before it can be referenced in a CHECK constraint
-- ("unsafe use of new value ... New enum values must be committed before
-- they can be used"), so this waits for the previous migration's own
-- transaction to commit first — same reasoning as
-- 20260902184900_add_streak_bonus_constraints.
--
-- Punkte-Shop (intake "points-shop-real-life-rewards", Architektur §1.5):
-- REWARD_REDEMPTION is a ledger-only debit, the same shape as BUYOUT but tied
-- to a RewardRedemption instead of a TaskAssignment, so it needs its own
-- pair of columns-together / has-link / one-debit-per-redemption checks
-- rather than reusing task_assignment_id.

-- §44's shape, mirrored for the shop: "Ein Freikauf kostet Punkte" applies
-- here too — buying a reward always debits.
ALTER TABLE "point_transactions"
  ADD CONSTRAINT "pt_reward_redemption_costs_points"
  CHECK ("type" <> 'REWARD_REDEMPTION' OR "amount" < 0);

-- reward_redemption_id is set if and only if the type is REWARD_REDEMPTION —
-- mirrors pt_assignment_columns_together's reasoning for task_assignment_id,
-- but as a single equivalence since there is no companion "kind" column here.
ALTER TABLE "point_transactions"
  ADD CONSTRAINT "pt_reward_redemption_id_matches_type"
  CHECK (("type" = 'REWARD_REDEMPTION') = ("reward_redemption_id" IS NOT NULL));

-- Höchstens ein Freikauf-Debit je Einlösung — Vorbild pt_one_buyout_per_assignment.
CREATE UNIQUE INDEX "pt_one_redemption_debit_per_redemption"
  ON "point_transactions" ("reward_redemption_id")
  WHERE "type" = 'REWARD_REDEMPTION';
