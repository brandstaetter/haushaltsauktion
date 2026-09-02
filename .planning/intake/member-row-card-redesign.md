---
title: "Mitglieder-Karte (MemberRow) neu gestalten: konsistentes Layout, Buttons horizontal mit Icons"
status: in-progress
priority: normal
target: apps/web/src/pages/AdminPage/MembersSection.tsx, apps/web/src/pages/AdminPage/AdminPage.module.css, apps/web/src/components/Button/
campaign: mitglieder-karte-memberrow-neu-gestalten-konsistentes-layout-buttons-horizontal-
---

## Description

Die Mitglieder-Karte in der Mitgliederverwaltung (`MemberRow` in
`MembersSection.tsx`, Layout in `AdminPage.module.css`) wirkt aktuell
inkonsistent und kopflastig:

- Die Rollen-Dropdown (`<select>`) ist deutlich größer/prominenter als die
  Checkbox ("Aktiv") und die Text-/Zahleneingaben daneben, obwohl sie
  inhaltlich gleichrangig sind (`.field select` bekommt dieselbe Padding wie
  `.field input`, wirkt aber durch das native Select-Rendering wuchtiger).
- Die drei Aktions-Buttons ("Speichern", "Einschränkungen", "Passwort
  zurücksetzen" — `.rowActions` in `MemberRow`) sind `size="lg"` und
  brechen auf schmalen Karten/Mobile per `flex-wrap` untereinander um. In
  Summe nehmen sie dadurch mehr als die Hälfte der Kartenfläche ein.

Gewünschtes Ergebnis:

1. Konsistenteres Layout der Eingabefelder (Rollen-Dropdown, Aktiv-Checkbox,
   Zahleneingabe max. Zufallszuweisungen) — vergleichbare visuelle Größe/
   Gewichtung statt einer überdimensionierten Dropdown neben kleinen
   Checkbox-/Text-Elementen.
2. Die drei Buttons werden nebeneinander (horizontal) angeordnet statt
   untereinander zu stapeln, mit deutlich reduziertem Flächenanteil an der
   Karte.
3. Jeder der drei Buttons bekommt zusätzlich zum Label ein passendes Icon
   (Icon + Text), z. B. Speichern/Save-Icon, Einschränkungen/Filter- oder
   Sperr-Icon, Passwort-zurücksetzen/Schlüssel-Icon. Im Projekt existiert
   aktuell keine Icon-Komponente/-Bibliothek — es muss eine leichtgewichtige,
   konsistente Lösung eingeführt werden (z. B. kleine Inline-SVGs analog zu
   den in `split-verwaltung-nav-pages.md` erwähnten Nav-Icons), keine neue
   schwere Icon-Font-Abhängigkeit ohne Rücksprache.

## Acceptance Criteria

- `MemberRow` zeigt Rollen-Dropdown, Aktiv-Checkbox und Zahleneingabe in
  konsistenter visueller Größe/Ausrichtung (kein deutlicher Größensprung
  zwischen Dropdown und den übrigen Feldern).
- Die drei Buttons ("Speichern", "Einschränkungen", "Passwort
  zurücksetzen") stehen nebeneinander in einer Reihe (horizontal), auch auf
  typischen Mobile-Breiten, und beanspruchen sichtbar weniger vertikale
  Fläche der Karte als zuvor.
- Jeder Button zeigt Icon + Label (kein reiner Icon-Button ohne Text).
- Bestehende Funktionalität (Speichern nur bei `dirty`, Öffnen der
  Restrictions-/Reset-Password-Sheets) bleibt unverändert.
- Responsives Verhalten geprüft (schmale Mobile-Breite und Desktop).
- Typecheck, Lint und bestehende Unit-Tests (u.a.
  `MembersSection.test.tsx`) bleiben grün; betroffene Selektoren/Snapshots
  ggf. anpassen.

## Notes

"User card" bezieht sich hier auf die Mitglieder-Karte in der
Admin-Mitgliederverwaltung (`/verwaltung/benutzer`), da im Code keine
separate "UserCard"-Komponente existiert — die nächstliegende Entsprechung
ist `MemberRow` innerhalb von `MembersSection`.
