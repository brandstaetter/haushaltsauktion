-- intake "points-shop-virtual-gamification-items" (Architektur §1.5): what
-- the Prisma DSL for RewardDefinition/MemberEffect cannot express — the
-- columns-together and value-consistency rules that keep a VIRTUAL_EFFECT
-- catalog row and an active effect row internally coherent, mirroring the
-- CHECK-constraint idiom of 20260903060000_add_reward_shop_constraints.

-- kind = VIRTUAL_EFFECT iff effect_type is set — the same columns-together
-- shape as pt_reward_redemption_id_matches_type.
ALTER TABLE "reward_definitions"
  ADD CONSTRAINT "rd_virtual_effect_has_effect_type"
  CHECK (("kind" = 'VIRTUAL_EFFECT') = ("effect_type" IS NOT NULL));

-- MANUAL_FULFILLMENT rows never carry effect parameters — a stray value here
-- would be dead configuration nobody reads, silently.
ALTER TABLE "reward_definitions"
  ADD CONSTRAINT "rd_manual_fulfillment_has_no_effect_params"
  CHECK ("kind" <> 'MANUAL_FULFILLMENT'
         OR ("effect_duration_minutes" IS NULL
             AND "effect_charges" IS NULL
             AND "effect_multiplier" IS NULL));

-- IMMUNITY needs exactly a duration, and nothing charge/multiplier-shaped —
-- those parameters belong to MULTIPLIER only (§16, per-item configurability).
ALTER TABLE "reward_definitions"
  ADD CONSTRAINT "rd_immunity_effect_shape"
  CHECK ("effect_type" IS DISTINCT FROM 'IMMUNITY'
         OR ("effect_duration_minutes" IS NOT NULL
             AND "effect_charges" IS NULL
             AND "effect_multiplier" IS NULL));

-- MULTIPLIER needs all three: a duration window, a charge count, and the
-- factor itself — `RewardBody` in admin.ts enforces the same shape at
-- request time; this is the backstop for any row that bypasses it.
ALTER TABLE "reward_definitions"
  ADD CONSTRAINT "rd_multiplier_effect_shape"
  CHECK ("effect_type" IS DISTINCT FROM 'MULTIPLIER'
         OR ("effect_duration_minutes" IS NOT NULL
             AND "effect_charges" IS NOT NULL
             AND "effect_multiplier" IS NOT NULL));

ALTER TABLE "reward_definitions"
  ADD CONSTRAINT "rd_effect_duration_positive"
  CHECK ("effect_duration_minutes" IS NULL OR "effect_duration_minutes" > 0);

ALTER TABLE "reward_definitions"
  ADD CONSTRAINT "rd_effect_charges_positive"
  CHECK ("effect_charges" IS NULL OR "effect_charges" > 0);

ALTER TABLE "reward_definitions"
  ADD CONSTRAINT "rd_effect_multiplier_positive"
  CHECK ("effect_multiplier" IS NULL OR "effect_multiplier" > 0);

-- member_effects: multiplier_value/charges_remaining are set together, and
-- only for MULTIPLIER — mirrors the shape check above, one layer down where
-- the effect actually lives.
ALTER TABLE "member_effects"
  ADD CONSTRAINT "me_multiplier_fields_match_type"
  CHECK (("type" = 'MULTIPLIER') = ("multiplier_value" IS NOT NULL AND "charges_remaining" IS NOT NULL));

-- Never negative — the compare-and-set in completeTask.ts decrements under a
-- WHERE chargesRemaining > 0 guard, but a CHECK is the backstop that makes a
-- negative count a database error rather than a possibility the application
-- merely promises never to create (same reasoning as the reward-shop
-- constraints it mirrors).
ALTER TABLE "member_effects"
  ADD CONSTRAINT "me_charges_remaining_not_negative"
  CHECK ("charges_remaining" IS NULL OR "charges_remaining" >= 0);

ALTER TABLE "member_effects"
  ADD CONSTRAINT "me_multiplier_value_positive"
  CHECK ("multiplier_value" IS NULL OR "multiplier_value" > 0);
