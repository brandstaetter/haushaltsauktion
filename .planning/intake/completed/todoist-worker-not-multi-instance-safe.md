---
title: "Todoist-Reconciler ist nicht sicher für mehrere API-Instanzen (nur durch Konvention geschützt)"
status: completed
priority: low
target: apps/api/src/infra/jobs/todoist-worker.ts, apps/api/src/main.ts
campaign: todoist-reconciler-ist-nicht-sicher-f-r-mehrere-api-instanzen-nur-durch-konventi
---

## Description

Bei der Architektur-Review fiel ein selbst-dokumentierter, aber
unadressierter Schwachpunkt auf: der Todoist-Reconciliation-/Dispatch-Worker
ist — anders als der Zuweisungs-Sweep — **nicht** durch einen
Advisory-Lock gegen gleichzeitigen Lauf mehrerer API-Instanzen geschützt.

`apps/api/src/infra/jobs/todoist-worker.ts` (Zeilen 15-17) sagt es selbst:

> Any deployment running more than one API instance must therefore set
> `TODOIST_INTERVAL_SECONDS=0` on all but one. Before scaling out, add a
> per-household advisory lock mirroring `acquireSweepLock`.

Und `apps/api/src/main.ts` (Zeilen 74-78) bestätigt: die
Notification-Idempotenz des Reconcilers setzt voraus, dass **genau eine**
Instanz ihn laufen lässt — durchgesetzt einzig durch die operative Disziplin,
`TODOIST_INTERVAL_SECONDS=0` manuell auf allen Instanzen außer einer zu
setzen. Es gibt (anders als bei `acquireSweepLock` in `apps/api/src/app/tx.ts`, das
`pg_advisory_xact_lock` pro Haushalt nimmt) keinen technischen Mechanismus,
der eine versehentliche Doppelausführung verhindert.

Aktuell besteht **kein akutes Risiko**: `deploy/docker-compose.prod.yml` und
`docker-compose.yml` konfigurieren keine Replikation (kein `replicas:`,
kein `scale:`), es läuft also nur eine API-Instanz. Das Risiko ist rein
latent — es aktiviert sich erst, falls das Deployment jemals horizontal
skaliert wird, was bei der in CLAUDE.md §43 beschriebenen Zielgröße
(1-20 Mitglieder, keine Hochlastplattform) unwahrscheinlich, aber nicht
ausgeschlossen ist.

## Acceptance Criteria

- Entweder: ein `pg_advisory_xact_lock`-basierter Lock (analog
  `acquireSweepLock` in `apps/api/src/app/tx.ts`) wird um den
  Todoist-Reconciliation-/Dispatch-Lauf gelegt, sodass eine zweite Instanz
  den Lauf überspringt statt doppelt zu reconcilen/dispatchen.
- Oder: falls der Aufwand für die aktuelle Ein-Instanz-Realität nicht
  gerechtfertigt ist, wird der bestehende Kommentar in `todoist-worker.ts`
  und `main.ts` um einen expliziten Verweis auf dieses Intake-Item ergänzt,
  damit die Einschränkung beim nächsten Skalierungs-Vorhaben nicht erneut
  recherchiert werden muss.
- Die Wahl zwischen beiden Optionen liegt bei der Umsetzung.

## Notes

Kein Bug im laufenden Ein-Instanz-Betrieb. Niedrige Priorität, da die
Zielgröße des Projekts (CLAUDE.md §43) horizontale Skalierung unwahrscheinlich
macht — aber ein präziser, bereits im Code benannter Schwachpunkt, der sonst
nur in einem Kommentar lebt und leicht übersehen wird, falls doch skaliert
werden soll.
