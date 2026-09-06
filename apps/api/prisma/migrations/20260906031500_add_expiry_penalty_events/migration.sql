ALTER TYPE "HistoryEventType" ADD VALUE 'EXPIRY_PENALTY';
ALTER TYPE "NotificationType" ADD VALUE 'TASK_EXPIRED_PENALTY';

-- Defense in depth: an expiry penalty is a debit in both application
-- arithmetic and PostgreSQL, never a configurable reward in disguise.
ALTER TABLE "point_transactions"
  ADD CONSTRAINT "pt_penalty_costs_points"
  CHECK ("type" <> 'PENALTY' OR "amount" < 0);
