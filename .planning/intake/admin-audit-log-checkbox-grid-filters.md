---
title: "Admin-Audit-Log: Dropdown durch Checkbox-Grid ersetzen, Multi-Select + Akteur-Filter + Session-Merken"
status: pending
priority: high
target: apps/web/src/pages/AdminPage/AuditLogSection.tsx, apps/web/src/api/hooks.ts, apps/web/src/strings/de.ts
---

## Description

`AuditLogSection.tsx` (`apps/web/src/pages/AdminPage/AuditLogSection.tsx:22-42`)
filtert das Audit-Log aktuell über ein einzelnes `<select>` — genau eine
`AuditAction` oder "Alle Aktionen" (`useState<AuditAction | ''>`). Das
`AuditAction`-Enum (`packages/shared/src/domain/enums.ts:164-206`) hat 37
Werte, was das Dropdown für "zeig mir POINTS_ADJUSTED und ROLE_CHANGED
zusammen" unbrauchbar macht — nur eine Aktion gleichzeitig ist wählbar.

Gewünschte Änderung:

1. **Dropdown → Checkbox-Grid**: die einzelne `<select>` wird durch ein
   3- oder 4-spaltiges Grid aus Checkboxen ersetzt, eine pro `AuditAction`
   (`Object.values(AuditAction)`, siehe aktuelles `.map()` in der Datei), so
   dass jede Kombination von Aktionen gleichzeitig ausgewählt werden kann.
2. **"Alle"/"Keine" Aktion**: zwei Buttons/Links über oder neben dem Grid, um
   in einem Klick alle Checkboxen zu setzen bzw. zu leeren.
3. **Akteur-Filter**: zusätzliche Checkboxen, um nach einzelnen Personen
   und/oder "System" zu filtern. `AdminAuditEventDto` trägt bereits
   `actorType` (`'MEMBER' | 'SYSTEM'`, siehe Rendering-Zweig
   `event.actorType === 'SYSTEM' ? de.admin.auditLog.actorSystem : event.actor?.displayName`
   in der aktuellen Datei) und für `MEMBER`-Events `actor.{id, displayName}`.
   Die Haushaltsmitglieder-Liste ist bereits über einen bestehenden Hook
   verfügbar (siehe Verwendung in anderen Admin-Sections, z. B. `useMembers`)
   — kein neuer Endpunkt nötig, um die Namen für die Checkboxen zu befüllen.
4. **Zustand merken**: nach jeder Änderung (Aktion an/aus, Akteur an/aus,
   Alle/Keine) wird der Filterzustand im Browser gemerkt — laut Anfrage
   reicht Session- oder `localStorage`, keine Server-Persistenz pro Nutzer
   nötig. `InstallPrompt.tsx` (`apps/web/src/components/InstallPrompt/InstallPrompt.tsx`)
   verwendet bereits direktes `localStorage.getItem`/`setItem` ohne
   Wrapper-Utility — dieses Muster kann übernommen werden, statt eine neue
   Abstraktion einzuführen.

Offene Designfrage fürs Briefing: aktuell akzeptiert
`GET /admin/audit-events` (`apps/api/src/infra/http/routes/admin.ts:1421-1449`)
serverseitig nur **eine** `action` und **eine** `memberId` als Query-Parameter
(kein `actorType`-Filter). Zwei Wege sind denkbar:

- (a) Backend-Route um Mehrfachwerte (`action[]`, `memberId[]`) und einen
  `actorType`-Parameter erweitern, oder
- (b) da die Route ohnehin auf max. 100 Zeilen begrenzt ist
  (`Math.min(query.limit ?? 50, 100)`), den kompletten ungefilterten Datensatz
  einmal laden (`useAdminAuditEvents()` ohne `action`) und Mehrfach-Aktion- +
  Akteur-Filterung rein clientseitig in `AuditLogSection.tsx` anwenden.

Option (b) vermeidet API-Änderungen komplett und passt zur Größenordnung
dieser Seite (§43, 1–20 Mitglieder, Admin-only Ansicht) — zu entscheiden im
Briefing, falls sich daraus doch Pagination-Probleme ergeben sollten.

## Acceptance Criteria

- Das Dropdown ist durch ein 3- oder 4-spaltiges Grid aus Checkboxen ersetzt,
  eine pro `AuditAction`; beliebige Kombinationen sind gleichzeitig wählbar,
  und das Log zeigt genau die Events, deren `action` in der gewählten Menge
  liegt (leere Auswahl = alle Aktionen, wie heute "Alle Aktionen").
- Ein "Alle auswählen" und ein "Keine auswählen" Control setzt/leert alle
  Checkboxen in einem Klick.
- Zusätzliche Checkboxen erlauben das Filtern nach einzelnen Haushaltsmitgliedern
  und/oder "System" (`actorType === 'SYSTEM'`); auch hier sind beliebige
  Kombinationen wählbar.
- Nach jeder Filteränderung (Aktion, Akteur, Alle/Keine) bleibt der gewählte
  Zustand erhalten, wenn die Seite neu geladen wird oder der Nutzer sie
  verlässt und zurückkehrt — mindestens für die aktuelle Browser-Session,
  idealerweise über `localStorage` auch über Sessions hinweg. Keine
  Server-Persistenz pro Nutzer erforderlich.
- Bestehendes Verhalten bleibt erhalten: Ladeindikator, Empty-State
  (`de.admin.auditLog.empty`), und die Event-Darstellung (Aktion, Zeitstempel,
  Akteur, `amount`/`reason` aus dem Payload) ändern sich nicht.
- Serverseitig verbindlich (§36): kein zusätzliches Vertrauen in clientseitig
  berechnete Filterergebnisse — falls Filterung serverseitig erfolgt, muss
  die Route weiterhin nur householdeigene Events zurückgeben
  (`requireAdmin` + `householdId`-Scoping bleibt unverändert).
