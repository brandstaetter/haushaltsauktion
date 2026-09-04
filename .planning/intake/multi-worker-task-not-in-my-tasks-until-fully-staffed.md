---
title: "Multi-Worker-Aufgabe erscheint erst in „Meine Aufgaben“, wenn alle Slots besetzt sind — nicht sobald der Viewer selbst einen Slot hält"
status: completed
priority: normal
target: apps/api/src/app/queries/taskDto.ts, apps/web/src/pages/TaskListPage/TaskListPage.tsx
campaign: multi-worker-aufgabe-erscheint-erst-in-meine-aufgaben-wenn-alle-slots-besetzt-si
---

## Description

Reproduziert an einer Aufgabe mit `workerCountMode: EXACTLY`, `workerCount: 2`
("2 benötigte Helfer"): Nutzer übernimmt freiwillig einen der beiden Slots.
Danach:

- Die Aufgabe steht weiterhin unter „Verfügbar“ (`/aufgaben`, Tab
  `available`) — **mit** dem „Erledigen“-Button statt „Freiwillig
  übernehmen“.
- Sie taucht auch in „Alle Aufgaben“ auf (dort erwartungsgemäß ohne CTA,
  siehe `renderHouseholdItems` in `TaskListPage.tsx`).
- Sie erscheint **nicht** unter „Meine Aufgaben“ (Tab `mine`) — erst sobald
  der zweite Slot ebenfalls besetzt ist, wechselt sie dorthin.

**Ursache**: `volunteerForTask.ts` (Zeile 240-243) setzt `TaskInstance.status`
für einen `JOIN` nur dann von `AVAILABLE` auf `ASSIGNED`, wenn dieser Beitritt
tatsächlich `minRequired` erreicht (`!outcome.isBelowMin`). Bei
`EXACTLY(2)` bleibt der Status nach dem ersten Beitritt also `AVAILABLE` —
korrekt, denn die Aufgabe braucht noch einen zweiten Freiwilligen.

`listAssignedToMe()` (`apps/api/src/app/queries/taskDto.ts:363-377`,
`GET /tasks/assigned-to-me`) filtert aber hart auf `status: 'ASSIGNED'`
**zusätzlich** zur eigentlich richtigen Bedingung
`assignments: { some: { status: 'ACTIVE', memberId: ctx.memberId } }`:

```ts
where: {
  householdId: ctx.householdId,
  status: 'ASSIGNED',
  assignments: { some: { status: 'ACTIVE', memberId: ctx.memberId } },
},
```

Solange die Instanz noch `AVAILABLE` ist (min noch nicht erreicht), matcht
diese Query nicht — obwohl der Viewer bereits eine `ACTIVE`-Zuweisung hält.
Das ist exakt dieselbe Bugklasse wie das bereits behobene Intake-Item
"multi-worker-task-vanishes-from-available-list-after-first-volunteer": dort
filterte `listAvailableTasks()` hart auf `status: 'AVAILABLE'` und musste um
`ASSIGNED`-mit-freiem-Slot erweitert werden
(`apps/api/src/app/queries/taskDto.ts:337-354`). Die Spiegel-Query
`listAssignedToMe()` hat dieselbe Behandlung nie bekommen — der Kommentar bei
Zeile 381-384 ("Multi-worker-tasks Phase 3") beschreibt zwar, dass `mine`
jetzt korrekt per `memberId` statt `assignments[0]` gesucht wird, aber der
`where`-Filter selbst (`status: 'ASSIGNED'`) wurde dabei nicht angepasst.

Zusätzlich zum reinen Sichtbarkeits-Bug ist auch die UX in der Zwischenzeit
verwirrend: Solange die Aufgabe (mangels korrektem `assigned-to-me`-Eintrag)
nur unter „Verfügbar“ erreichbar ist, mischt dieser Tab für den Viewer zwei
unterschiedliche Rollen im selben Kartenstapel — „hier kann ich noch
beitreten“ und „hier bin ich schon dabei, kann aber nur noch erledigen“
(`TaskCard.tsx` Zeile 53-54, `isHeld` schaltet Label und Aktion um) — ohne
dass der Tabname („Verfügbar“) das für den zweiten Fall ankündigt.

`EXACTLY(1)`-Aufgaben (der Normalfall) sind nicht betroffen: `min === max ===
1`, also crosst der erste (und einzige) Beitritt `minRequired` immer sofort,
und der Status wird sofort `ASSIGNED`.

## Acceptance Criteria

- Sobald ein Mitglied eine `ACTIVE`-Zuweisung auf einer `TaskInstance` hält,
  erscheint diese Instanz unter „Meine Aufgaben“ — unabhängig davon, ob
  `TaskInstance.status` bereits `ASSIGNED` ist oder (bei `EXACTLY`/`AT_LEAST`
  unterhalb `minRequired`) noch `AVAILABLE`. `listAssignedToMe()`s
  `where`-Filter muss dafür allein auf die `assignments`-Bedingung abstellen,
  nicht zusätzlich auf `TaskInstance.status`.
- Solange eine Multi-Worker-Aufgabe noch offene Slots für **andere** Personen
  hat, bleibt sie weiterhin zusätzlich unter „Verfügbar“ sichtbar (damit sich
  weitere Freiwillige melden können) — dieses bereits behobene Verhalten aus
  "multi-worker-task-vanishes-from-available-list-after-first-volunteer"
  darf durch diese Änderung nicht regressieren.
- Zu entscheiden im Briefing, ob die „Verfügbar“-Karte für eine Instanz, bei
  der der Viewer selbst schon einen Slot hält, weiterhin dort auftaucht (jetzt
  redundant zu „Meine Aufgaben“) oder ab dann aus „Verfügbar“ verschwinden
  soll, weil der Viewer für sich selbst nichts mehr zu „übernehmen“ hat — in
  beiden Fällen darf die Sichtbarkeit für die *übrigen* Mitglieder (Slot noch
  offen) unverändert bleiben.
- `EXACTLY(1)`-Aufgaben (heutiger Normalfall) verhalten sich unverändert.
- Serverseitig verbindlich (§36): keine neue clientseitige Filterlogik nötig
  — der Fix gehört in die Leseabfrage, nicht ins Frontend.
