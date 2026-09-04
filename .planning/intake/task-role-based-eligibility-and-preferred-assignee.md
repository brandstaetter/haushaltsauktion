---
title: "Flexiblere Berechtigungen: rollenbasierte Aufgaben-Eligibility und bevorzugte Zuweisung"
status: completed
priority: normal
target: apps/api/prisma/schema.prisma, apps/api/src/domain/assignment/eligibility.ts, apps/api/src/app/assignment/candidates.ts, packages/shared/src/domain/enums.ts, apps/api/src/infra/http/routes/admin.ts, apps/web/src/components/TaskMaintenanceCard/
campaign: flexiblere-berechtigungen-rollenbasierte-aufgaben-eligibility-und-bevorzugte-zuw
---

## Description

Das aktuelle Eligibility-Modell (`TaskDefinitionEligibility`, Modi `INCLUDED`/`EXCLUDED`,
ausgewertet in `domain/assignment/eligibility.ts` Regeln 1-5) kennt nur "diese konkrete
Person darf/darf nicht". Es gibt keine rollenbasierte Regel ("nur Admins", "nur normale
Mitglieder") und keine weiche Präferenz ("sollte bevorzugt diese Person bekommen, aber
niemand ist hart ausgeschlossen").

Gewünscht sind zwei neue, unabhängige Ergänzungen zum bestehenden Eligibility-Modell:

1. **Rollenbasierte Berechtigung** — eine Aufgabendefinition kann verlangen "nur Admins"
   oder "nur normale Mitglieder" (`MemberRole.ADMIN`/`MEMBER`, siehe `enums.ts`), zusätzlich
   zu (nicht anstelle von) den bestehenden personenbezogenen INCLUDED/EXCLUDED-Regeln.
   Für Multi-Worker-Aufgaben (siehe laufende Campaign
   `.planning/campaigns/multi-worker-tasks.md`) zusätzlich: "mindestens N der besetzten
   Slots müssen Admins sein" — eine Mindestanzahl, keine feste Zuordnung welcher Slot.

2. **Bevorzugte Zuweisung ("soll idealerweise diese Person bekommen")** — eine weiche
   Präferenz, die weder die freiwillige Übernahme noch die Zufallsvergabe hart einschränkt
   (anders als INCLUDED/EXCLUDED, die harte Regeln 1-5 sind, siehe §6.9). Am ehesten als
   zusätzliches Gewicht in der `WEIGHTED_FAIRNESS`-Strategie (`domain/assignment/weights.ts`)
   denkbar, nicht als Ausschlusskriterium — eine bevorzugte Person, die abwesend oder
   überlastet ist, soll die Aufgabe nicht blockieren.

Beide Ergänzungen sollten, wie alles in diesem Codebase, admin-konfigurierbar pro
Aufgabendefinition sein und über den bestehenden Audit-/Explain-Mechanismus (§32,
`GET /assignments/:id/explain`) nachvollziehbar bleiben — eine rollenbasierte Ablehnung
oder eine wirksame Präferenz sollte im Fairness-Explain genauso sichtbar sein wie die
bestehenden Ausschlussgründe.

## Acceptance Criteria

- Eine Aufgabendefinition kann optional auf eine Rolle beschränkt werden (`ADMIN_ONLY` /
  `MEMBER_ONLY` / kein Filter), ausgewertet als zusätzliche harte Regel neben den
  bestehenden Regeln 1-5 in `hardEligibilityReason` — nicht als Ersatz dafür.
- Für Multi-Worker-Aufgaben (`workerCountMode`/`workerCount`, siehe
  `.planning/architecture-multi-worker-tasks.md`) kann zusätzlich eine
  Mindestanzahl an Admin-Slots konfiguriert werden (z. B. `minAdminSlots: Int?`); die
  Zuweisungslogik (freiwillig und Zufallsvergabe) muss diese Mindestanzahl absichern,
  ohne bereits besetzte Nicht-Admin-Slots nachträglich zu verdrängen.
- Eine "bevorzugte Person" (oder mehrere) kann pro Aufgabendefinition hinterlegt werden;
  sie beeinflusst nur die Gewichtung bei `WEIGHTED_FAIRNESS`, blockiert aber nie eine
  freiwillige Übernahme durch jemand anderen und schließt niemanden von der
  Zufallsvergabe aus.
- Beide neuen Regeln sind serverseitig verbindlich (§36 — keine clientseitig
  vertraute Berechtigungslogik) und im Fairness-Explain (§32) sichtbar, wenn sie
  eine Auswahl beeinflusst haben.
- Admin-Oberfläche (`TaskMaintenanceCard`) erlaubt das Setzen beider Optionen beim
  Anlegen/Bearbeiten einer Aufgabendefinition.
- Bestehende Aufgaben ohne diese neuen Felder verhalten sich unverändert (kein Rollenfilter,
  keine Präferenz — reiner Opt-in).

## Notes

Baut auf der laufenden Multi-Worker-Tasks-Campaign auf (insbesondere für den
"mindestens N Admin-Slots"-Teil, der `workerCountMode`/`workerCount` voraussetzt) —
sinnvollerweise erst nach deren Abschluss angehen, damit nicht zwei Kampagnen
gleichzeitig an `domain/assignment/eligibility.ts` und `candidates.ts` arbeiten.

Die beiden Teile (rollenbasierte Härte-Regel, weiche Präferenz) sind unabhängig
voneinander umsetzbar und könnten auch als zwei getrennte Intake-Items/Kampagnen
laufen, falls das bei der Priorisierung sinnvoller erscheint.
