---
title: "Punkte-Shop: Einträge nach virtuell/real gruppieren, dann absteigend nach Kosten, dann alphabetisch"
status: completed
priority: normal
target: apps/api/src/infra/http/routes/rewards.ts
campaign: punkte-shop-eintr-ge-nach-virtuell-real-gruppieren-dann-absteigend-nach-kosten-d
---

## Description

`GET /rewards` (`apps/api/src/infra/http/routes/rewards.ts:28-30`) sortiert die
Katalogeinträge aktuell mit einem einzelnen `orderBy: { cost: 'asc' }` — flach
aufsteigend nach Preis, ohne Gruppierung nach Art und ohne Tiebreak bei gleichem
Preis. Das Frontend (`RewardsShopPage.tsx`) übernimmt einfach die vom Server
gelieferte Reihenfolge, es gibt dort keine eigene Sortierlogik.

Gewünscht:

1. Gruppierung nach `RewardDefinition.kind` (`MANUAL_FULFILLMENT` = reale Belohnung,
   `VIRTUAL_EFFECT` = virtuelles Gamification-Item, siehe `enums.ts`/`RewardKind`) —
   **virtuelle Items zuerst, reale Belohnungen danach.**
2. Innerhalb jeder Gruppe absteigend nach `cost` sortiert (aktuell aufsteigend).
3. Bei gleichem `cost` innerhalb einer Gruppe alphabetisch nach `title`.

## Acceptance Criteria

- `GET /rewards` liefert die Einträge in der Reihenfolge: `VIRTUAL_EFFECT`-Gruppe
  vor `MANUAL_FULFILLMENT`-Gruppe → `cost` absteigend → `title` alphabetisch
  aufsteigend als Tiebreak.
- Umsetzbar als reine Änderung der Prisma-`orderBy`-Klausel (mehrere Sortierschlüssel
  in Folge, z. B. `[{ kind: 'desc' }, { cost: 'desc' }, { title: 'asc' }]`).
  Achtung bei der Umsetzung: Postgres/Prisma sortieren einen Enum standardmäßig nach
  seiner **Deklarationsreihenfolge** in `schema.prisma`, nicht alphabetisch — `enum
  RewardKind { MANUAL_FULFILLMENT VIRTUAL_EFFECT }` deklariert `MANUAL_FULFILLMENT`
  zuerst, also ergibt `kind: 'desc'` tatsächlich `VIRTUAL_EFFECT` zuerst (nicht
  verlassen auf einen alphabetischen Zufallstreffer). Bei der Implementierung mit
  einem kleinen Testfall verifizieren, nicht nur aus der Deklarationsreihenfolge
  ableiten. Keine Frontend-Änderung nötig, da `RewardsShopPage` die
  Server-Reihenfolge bereits unverändert übernimmt.
- Die Admin-Liste (`AdminRewardsPage`/`RewardsSection.tsx`) ist von dieser Änderung
  bewusst NICHT betroffen, sofern sie eine eigene Sortierung hat — hier nur den
  mitgliederseitigen Shop-Endpunkt (`GET /rewards`) anpassen. Falls die Admin-Liste
  denselben Endpunkt oder dieselbe Query wiederverwendet, entsprechend mitprüfen.
- Bestehende Tests für `GET /rewards` (falls vorhanden, z. B. in
  `apps/api/test/integration/reward-shop.test.ts` oder
  `apps/api/test/integration/virtual-effects.test.ts`) werden um eine Prüfung der
  neuen Sortierreihenfolge ergänzt (mehrere Einträge je Gruppe, inkl. Tiebreak-Fall
  mit identischen Kosten).

## Notes

Reihenfolge geklärt: virtuell vor real. Kleine, isolierte Änderung; guter
Kandidat für eine einzelne Skill-Session statt einer Campaign.
