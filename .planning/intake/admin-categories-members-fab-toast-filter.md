---
title: "Floating Toast, Filter und Floating-Add-Button auch für Kategorien und Benutzer"
status: completed
priority: normal
target: apps/web/src/pages/AdminPage/CategoriesSection.tsx, apps/web/src/pages/AdminPage/MembersSection.tsx
campaign: floating-toast-filter-und-floating-add-button-auch-f-r-kategorien-und-benutzer
---

## Description

`f54585c` (`fix: floating toast, filter box, and floating add button on admin
Aufgaben page`) hat drei UX-Verbesserungen auf `TaskDefinitionsSection.tsx`
angewendet: den wiederverwendbaren `Toast`-Component (fixed-position,
auto-dismiss nach 5s, dismissible) statt einer inline scrollenden
Erfolgs-/Fehlermeldung, ein Filter-Eingabefeld über der Liste mit eigenem
"keine Treffer"-Leerzustand, und einen fixed Floating Action Button
(`styles.fab`, unten rechts, über der Bottom-Nav) statt eines Buttons am
Ende der Liste.

`CategoriesSection.tsx` und `MembersSection.tsx` (beide unter
`Verwaltung > Kategorien` bzw. `Verwaltung > Benutzer`, siehe
`AdminCategoriesPage.tsx` / `AdminMembersPage.tsx`) haben dieselben drei
Lücken noch nicht geschlossen:

- Beide zeigen `message` weiterhin als inline `<div className={styles.message} role="status">`
  am Seitenanfang statt über `<Toast message={message} onDismiss={...} />`
  (der Component existiert bereits unter `apps/web/src/components/Toast/Toast.tsx`
  und wird in `AdminTasksPage.tsx`/`TaskDefinitionsSection.tsx` bereits so verwendet).
- Beide haben keinerlei Filter-Eingabefeld — bei wachsender Mitglieder- oder
  Kategorienliste gibt es keine Möglichkeit, sie einzugrenzen.
- Beide rendern den "Hinzufügen"-Button (`de.admin.categories.addButton` /
  `de.admin.members.addButton`) als normalen `<Button variant="secondary">`
  unterhalb der Liste statt als fixed `.fab`-Button mit `Plus`-Icon
  (`lucide-react`) analog zu `TaskDefinitionsSection.tsx`. Die `.fab`-CSS-Klasse
  ist bereits gemeinsam in `AdminPage.module.css` definiert — es muss nichts
  Neues gestylt werden, nur die JSX-Struktur angepasst werden.

## Acceptance Criteria

- `CategoriesSection` und `MembersSection` verwenden `Toast` statt der
  inline `message`-`<div>` für Erfolgs-/Fehlermeldungen auf Sektionsebene.
- Beide Sektionen haben ein Filter-Eingabefeld (analog `filterLabel` /
  `filterPlaceholder` / `filterEmpty` in `de.admin.taskDefinitions`) — für
  Kategorien mind. nach Name, für Benutzer mind. nach Anzeigename/E-Mail —
  mit eigenem "keine Treffer"-Leerzustand getrennt vom "keine Einträge
  vorhanden"-Leerzustand.
- Der "Hinzufügen"-Button beider Sektionen ist ein fixed `.fab`-Button
  (`Plus`-Icon, `aria-label` aus dem bestehenden `addButton`-String) statt
  eines Inline-Buttons am Listenende.
- Neue i18n-Strings folgen dem bestehenden Muster in `de.ts` unter
  `admin.categories.*` bzw. `admin.members.*`.
- Bestehende Tests für `CategoriesSection`/`MembersSection` (falls vorhanden)
  bleiben grün bzw. werden auf die neue Struktur angepasst; Typecheck und
  Lint bleiben grün.
