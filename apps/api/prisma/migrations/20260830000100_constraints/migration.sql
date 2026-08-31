-- ─────────────────────────────────────────────────────────────────────────────
-- Architektur §1.5 / §8.6 — was die Prisma-DSL nicht ausdrücken kann.
--
-- Jede Zeile hier macht aus einer Invariante aus CLAUDE.md §44 einen
-- Datenbankfehler statt eines fehlgeschlagenen Tests. Das ist der Unterschied
-- zwischen "die Regel wird eingehalten, weil der Code sie einhält" und "die
-- Regel kann nicht verletzt werden".
-- ─────────────────────────────────────────────────────────────────────────────


-- ══ Ledger-Arithmetik und Vorzeichen (§44, §8.1) ══

ALTER TABLE "point_transactions"
  ADD CONSTRAINT "pt_balance_arithmetic"
  CHECK ("balance_after" = "balance_before" + "amount");

-- §8.2 Schritt 1: ein Nulleintrag würde "keine Punkte" (die ABWESENHEIT einer
-- Zeile, §7) mit einem echten Vorgang verwischen.
ALTER TABLE "point_transactions"
  ADD CONSTRAINT "pt_amount_not_zero"
  CHECK ("amount" <> 0);

-- §44: "Ein Freikauf kostet Punkte."
ALTER TABLE "point_transactions"
  ADD CONSTRAINT "pt_buyout_costs_points"
  CHECK ("type" <> 'BUYOUT' OR "amount" < 0);

ALTER TABLE "point_transactions"
  ADD CONSTRAINT "pt_reward_gives_points"
  CHECK ("type" <> 'VOLUNTARY_TASK_REWARD' OR "amount" > 0);

ALTER TABLE "point_transactions"
  ADD CONSTRAINT "pt_decay_never_positive"
  CHECK ("type" <> 'DECAY' OR "amount" <= 0);


-- ══ §44, Kernsatz: eine zufällig zugewiesene, erledigte Aufgabe erzeugt keine Punkte ══
--
-- assignment_kind ist über den zusammengesetzten Fremdschlüssel
-- (task_assignment_id, assignment_kind) -> task_assignments(id, kind) an die
-- referenzierte Zuweisung gebunden. Über ihre Art zu lügen ist damit ein
-- Fremdschlüsselfehler, und dieser CHECK ist nicht umgehbar.
--
-- Der Fremdschlüssel verwendet MATCH SIMPLE: wäre eine der beiden Spalten NULL,
-- würde er gar nicht prüfen. Deshalb erzwingt der erste CHECK, dass beide
-- Spalten immer gemeinsam gesetzt oder gemeinsam NULL sind — sonst ließe sich
-- die Bindung durch ein NULL in assignment_kind aushebeln.
ALTER TABLE "point_transactions"
  ADD CONSTRAINT "pt_assignment_columns_together"
  CHECK (("task_assignment_id" IS NULL) = ("assignment_kind" IS NULL));

ALTER TABLE "point_transactions"
  ADD CONSTRAINT "pt_reward_only_for_voluntary"
  CHECK ("type" <> 'VOLUNTARY_TASK_REWARD'
         OR ("assignment_kind" IS NOT NULL AND "assignment_kind" = 'VOLUNTARY'));

-- Jede aus Arbeit entstandene Transaktion muss ihre Zuweisung benennen.
ALTER TABLE "point_transactions"
  ADD CONSTRAINT "pt_work_tx_has_assignment"
  CHECK ("type" NOT IN ('VOLUNTARY_TASK_REWARD', 'BUYOUT')
         OR "task_assignment_id" IS NOT NULL);

-- Höchstens eine Belohnung und höchstens ein Freikauf je Zuweisung.
-- Der idempotencyKey verhindert die Doppelbuchung bereits beim Wiederholen
-- desselben Aufrufs; diese partiellen Unique-Indizes verhindern sie auch dann,
-- wenn ein künftiger Codepfad einen anderen Schlüssel wählt (§4.7, Wächter 3).
CREATE UNIQUE INDEX "pt_one_reward_per_assignment"
  ON "point_transactions" ("task_assignment_id")
  WHERE "type" = 'VOLUNTARY_TASK_REWARD';

CREATE UNIQUE INDEX "pt_one_buyout_per_assignment"
  ON "point_transactions" ("task_assignment_id")
  WHERE "type" = 'BUYOUT';


-- ══ §44: ein Freikauf erhöht den aktuellen Wert ══

-- NULL-sicher formuliert: wäre value_before_buyout NULL, ergäbe der reine
-- Vergleich NULL und der CHECK gälte als erfüllt.
ALTER TABLE "task_assignments"
  ADD CONSTRAINT "ta_buyout_raises_value"
  CHECK ("value_after_buyout" IS NULL
         OR ("value_before_buyout" IS NOT NULL
             AND "value_after_buyout" > "value_before_buyout"));

ALTER TABLE "task_assignments"
  ADD CONSTRAINT "ta_buyout_fields_together"
  CHECK (("status" = 'BOUGHT_OUT') = ("buyout_cost" IS NOT NULL));

ALTER TABLE "task_assignments"
  ADD CONSTRAINT "ta_buyout_cost_positive"
  CHECK ("buyout_cost" IS NULL OR "buyout_cost" > 0);


-- ══ Höchstens eine ACTIVE-Zuweisung je Instanz (§4.3, Wächter 3) ══
--
-- Prisma erzeugt bereits UNIQUE(active_for_instance_id). Diese beiden CHECKs
-- halten den Sentinel ehrlich, der partielle Unique-Index formuliert dieselbe
-- Regel noch einmal direkt über task_instance_id — falls jemand den Sentinel
-- eines Tages entfernt, bleibt die Doppelbelegung trotzdem ein 23505.
ALTER TABLE "task_assignments"
  ADD CONSTRAINT "ta_active_sentinel_set_iff_active"
  CHECK (("status" = 'ACTIVE') = ("active_for_instance_id" IS NOT NULL));

ALTER TABLE "task_assignments"
  ADD CONSTRAINT "ta_active_sentinel_matches_instance"
  CHECK ("active_for_instance_id" IS NULL
         OR "active_for_instance_id" = "task_instance_id");

CREATE UNIQUE INDEX "ta_one_active_assignment_per_instance"
  ON "task_assignments" ("task_instance_id")
  WHERE "status" = 'ACTIVE';


-- ══ Wert- und Feldplausibilität ══

ALTER TABLE "task_instances"
  ADD CONSTRAINT "ti_values_non_negative"
  CHECK ("current_value" >= 0 AND "base_value" >= 0);

ALTER TABLE "task_definitions"
  ADD CONSTRAINT "td_base_value_non_negative"
  CHECK ("base_value" >= 0);

-- §1.4: auf 28 begrenzt, damit kein Monat übersprungen wird und weder DST noch
-- kurze Monate einen Sonderfall brauchen.
ALTER TABLE "task_definitions"
  ADD CONSTRAINT "td_recurrence_day_of_month_range"
  CHECK ("recurrence_day_of_month" IS NULL
         OR ("recurrence_day_of_month" BETWEEN 1 AND 28));

ALTER TABLE "member_absences"
  ADD CONSTRAINT "ma_window_ordered"
  CHECK ("ends_at" > "starts_at");


-- ══ §8.6 — Append-only auf Datenbankebene ══
--
-- Ein Bug, der einen Punktestand "reparieren" will, indem er eine Ledger-Zeile
-- ändert, scheitert an einem Berechtigungsfehler statt still zu gelingen. Das
-- ist die stärkste verfügbare Form von §14 ("Punkte dürfen niemals einfach als
-- numerischer Wert ohne Historie verändert werden").
--
-- Idempotent und optional: existiert die Laufzeitrolle nicht (lokales
-- Ein-Benutzer-Setup mit SKIP_ROLE_SEPARATION=true), passiert nichts.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'haushalt_app') THEN
    EXECUTE 'GRANT USAGE ON SCHEMA public TO haushalt_app';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO haushalt_app';
    EXECUTE 'GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO haushalt_app';

    EXECUTE 'REVOKE UPDATE, DELETE ON TABLE '
         || '"point_transactions", "audit_events", "task_history_events" '
         || 'FROM haushalt_app';
  END IF;
END
$$;
