---
title: "Admin kann offene Instanzen bei Aufgabendefinitions-Änderung nicht abbrechen oder automatisch aktualisieren"
status: completed
priority: normal
target: apps/api/src/infra/http/routes/admin.ts, apps/web/src/pages/AdminPage/TaskDefinitionsSection.tsx
campaign: admin-kann-offene-instanzen-bei-aufgabendefinitions-nderung-nicht-abbrechen-oder
---

## Description

Wenn ein Admin eine `TaskDefinition` bearbeitet (`PUT /admin/task-definitions/:id`),
bleiben bereits offene Instanzen (DRAFT/AVAILABLE/ASSIGNED/PAUSED) davon absichtlich
unberührt — siehe Kommentar in `admin.ts` bei diesem Handler: "changing `baseValue`
deliberately does NOT touch open instances: each one snapshotted its reset target at
materialization so an edit mid-cycle cannot move the payout of a chore already in
flight." Das ist eine bewusste Entscheidung (§1.4), aber sie lässt den Admin aktuell
ohne Werkzeug da, wenn er eine Änderung (z. B. neuer Basiswert, neue Berechtigung,
neue Rollenbeschränkung) tatsächlich auf laufende Instanzen durchschlagen lassen will.

Ein Abbrechen-Mechanismus existiert bereits teilweise: `POST
/admin/instances/:id/cancel` (`instanceAction` in `admin.ts`) kann eine Instanz
abbrechen — aber nur aus den Status `DRAFT`, `AVAILABLE` oder `PAUSED`
(`allowed.cancel`). Eine bereits **zugewiesene** (`ASSIGNED`) Instanz kann darüber
nicht abgebrochen werden, und selbst wo es ginge, gibt es dafür keine
Admin-Oberfläche: `LiveInstancesList` in `TaskDefinitionsSection.tsx` zeigt laufende
Instanzen einer Definition an, ist aber laut eigenem Kommentar bewusst "Read-only —
the unassign action itself is a separate ticket".

Gewünscht (zwei mögliche, sich nicht gegenseitig ausschließende Ansätze — welcher(r)
umgesetzt wird, sollte im Briefing entschieden werden):

1. **Manuelles Abbrechen/Beenden laufender Instanzen** — eine Admin-Aktion, um offene
   Instanzen einer Definition gezielt abzubrechen, inklusive `ASSIGNED`-Instanzen
   (was den aktuellen `cancel`-Übergang erweitern würde; zu klären, was mit bereits
   aktiven `TaskAssignment`-Zeilen dabei passiert — für multi-worker-Aufgaben
   vermutlich analog zur bestehenden Ablauf-Logik in `runAssignmentSweep.ts`, die
   beim Verfall einer `ASSIGNED`-Instanz jede aktive Zuweisung schließt). Braucht
   eine sichtbare Aktion im Admin-UI (Einzelinstanz und/oder "alle offenen Instanzen
   dieser Definition abbrechen").

2. **Automatische Aktualisierung offener Instanzen bei Definitionsänderung** — z. B.
   `currentValue` einer offenen (noch nicht angenommenen) Instanz neu berechnen, wenn
   sich `baseValue` ändert. Deutlich größerer Eingriff: verletzt möglicherweise die
   oben zitierte §1.4-Invariante ("ein Edit mitten im Zyklus darf den Auszahlungswert
   einer bereits laufenden Aufgabe nicht verschieben") und müsste sorgfältig
   abgegrenzt werden (z. B. nur `AVAILABLE`, nie `ASSIGNED`; nur bestimmte Felder wie
   `baseValue`/Berechtigung, nie Wiederholungsregeln).

## Acceptance Criteria

- Ein Admin hat einen Weg, offene Instanzen einer Aufgabendefinition gezielt zu
  beenden, ohne die Instanz-Detailseite oder Rohdaten manuell zu manipulieren.
- Falls Ansatz 1 (manuelles Abbrechen) umgesetzt wird: auch `ASSIGNED`-Instanzen
  können abgebrochen werden, inklusive korrektem Schließen aktiver Zuweisungen
  (Punkte-Ledger, Historie, Multi-Worker-Slots).
- Falls Ansatz 2 (Auto-Sync) umgesetzt wird: die §1.4-Invariante bleibt für bereits
  angenommene/zugewiesene Instanzen gewahrt — nur unangenommene (`AVAILABLE`)
  Instanzen dürfen sich automatisch anpassen, und das Verhalten ist entweder fest
  vorgegeben oder admin-konfigurierbar (§16/§17 — keine versteckten Regeln, §31).
- Serverseitig verbindlich (§36) — keine rein clientseitige Bestätigung.
