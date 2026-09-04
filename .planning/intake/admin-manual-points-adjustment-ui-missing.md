---
title: "Admin-Oberfläche für manuelle Punkteanpassung mit Begründung fehlt"
status: completed
priority: normal
target: apps/web/src/components/UserMaintenanceCard/, apps/web/src/api/
campaign: admin-oberfl-che-f-r-manuelle-punkteanpassung-mit-begr-ndung-fehlt
---

## Description

Gewünscht: als Admin einer Person Punkte mit Pflicht-Begründung gutschreiben oder
abziehen können — zum Beispiel wenn bereits etwas erledigt wurde, für das keine
Aufgabe existierte, und sich für einen einmaligen Vorgang keine eigene
`TaskDefinition` lohnt.

Das Backend dafür existiert bereits vollständig und macht genau das:
`POST /admin/members/:id/points/adjust` (`apps/api/src/app/points/adjustPoints.ts`,
Route registriert in `infra/http/routes/admin.ts:1119`) verlangt eine nicht-leere
`reason` (leer wird mit `VALIDATION_FAILED` abgelehnt — siehe Kommentar im Code:
"eine Anpassung mit leerer Begründung ist genau die 'setz einfach die Zahl'-Änderung,
die das Ledger verhindern soll"), bucht die Anpassung als `MANUAL_ADJUSTMENT`,
`BONUS`, `PENALTY` oder `CORRECTION` über das reguläre Ledger (`postTransaction`,
§14) und schreibt zusätzlich einen `POINTS_ADJUSTED`-Audit-Eintrag mit Betrag,
Begründung und neuem Saldo.

Es gibt aber **keine Frontend-Oberfläche** dafür — eine Suche über `apps/web/src`
nach dem Endpunkt/den Funktionsnamen ergibt keine Treffer. Der einzige Weg, die
Route aktuell auszulösen, ist ein direkter API-Call. `UserMaintenanceCard.tsx`
zeigt den Punktestand aktuell explizit als **read-only** an (siehe kürzliche
Commits "fix: visually distinguish Punktestand as read-only on
UserMaintenanceCard") — das ist der naheliegende Ort für eine neue Aktion, die
diese Lücke schließt.

## Acceptance Criteria

- In `UserMaintenanceCard` (oder einem von dort erreichbaren Dialog) gibt es eine
  Admin-Aktion "Punkte anpassen", die Betrag (positiv oder negativ, ganzzahlig,
  ≠ 0) und eine Pflicht-Begründung abfragt.
- Der Dialog ruft `POST /admin/members/:id/points/adjust` mit diesen Werten auf
  und zeigt serverseitige Validierungsfehler (leere Begründung, Betrag 0) inline
  an, statt sie nur als generischen Fehler zu zeigen.
- Nach erfolgreicher Anpassung aktualisiert sich der angezeigte Punktestand ohne
  vollständigen Seitenreload.
- Die Anpassung ist über die Punkte-Historie/den Audit-Log der Person nachvollziehbar
  sichtbar (bereits vorhanden über `POINTS_ADJUSTED`/`MANUAL_ADJUSTMENT` — hier nur
  sicherstellen, dass die UI diese neuen Einträge korrekt anzeigt und nicht als
  rohes Enum, siehe verwandtes, bereits behobenes Intake-Item
  `benachrichtigung-task-taken-erscheint-als-roh-enum-statt-als-text`).
- Nur Admins sehen/erreichen diese Aktion (serverseitige Autorisierung existiert
  bereits über die Admin-Route; hier nur UI-seitig absichern, keine neue
  Berechtigungslogik nötig).

## Notes

Reines Frontend-Feature — keine Backend-Änderung nötig, der Endpunkt ist bereits
korrekt implementiert und getestet. Sollte relativ klein/schnell umsetzbar sein
(eine Komponente + ein API-Client-Aufruf), guter Kandidat für eine einzelne
`/marshal`- oder Skill-Session statt einer vollen Campaign.
