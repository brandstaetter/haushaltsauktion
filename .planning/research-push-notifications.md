# Recherche: Push-Benachrichtigungen für neue verfügbare Aufgaben und Zufallszuweisungen

Intake: `research-push-notifications-task-available-and-assigned` · §24 · 2026-09-04

## Zusammenfassung

Web Push (VAPID) ist die richtige Wahl — kein Drittanbieter-Dienst nötig,
kostenlos, browserstandardisiert, und die PWA-Infrastruktur (Service Worker
über `vite-plugin-pwa`) existiert bereits im Repo. Der einzige Haken: die
aktuelle Service-Worker-Strategie (`generateSW`, Standardmodus von
`vite-plugin-pwa`) kann **keine eigenen Event-Handler** (`push`,
`notificationclick`) einbinden — das erfordert einen Wechsel auf
`strategies: 'injectManifest'` mit einer eigenen Service-Worker-Quelldatei.
Das ist die einzige Stelle, an der dieser Vorschlag den bestehenden PWA-Setup
tatsächlich anfassen muss; alles andere ist additiv.

Der Vorschlag gliedert sich in drei unabhängig auslieferbare Phasen. Phase 3
behebt nebenbei eine bereits bestehende Lücke: `TASK_AVAILABLE` ist als
`NotificationType` und deutscher Text längst vorhanden, wird aber **nirgendwo
emittiert** — das ist der konkrete "neue Aufgabe verfügbar"-Fall aus der
Anfrage, schon halb verdrahtet.

## Ausgangslage (was schon da ist)

- **In-App-Benachrichtigungen existieren bereits** über `Notifier.emit()`
  (`apps/api/src/app/deps.ts:44-46`), ein schmales Interface mit genau einer
  Methode. Die Produktionsimplementierung `dbNotifier` (`deps.ts:113-129`)
  schreibt `Notification`-Zeilen **innerhalb derselben Transaktion** wie das
  Ereignis, das sie rechtfertigt — ein committeter Buyout kann den Haushalt
  nie unbenachrichtigt lassen, ein zurückgerollter nie benachrichtigen. Diese
  Garantie muss ein Push-Layer erhalten, darf sie aber nicht selbst tragen
  (siehe Architekturvorschlag unten — Push ist bewusst *nicht* in derselben
  Transaktion).
- Aktuell ausgelöst wird `TASK_ASSIGNED` (Zufallszuweisung,
  `runAssignmentSweep.ts`) und `TASK_TAKEN` (freiwillige Übernahme,
  `volunteerForTask.ts`).
- **`TASK_AVAILABLE` ist bereits als `NotificationType` definiert**
  (`packages/shared/src/domain/enums.ts`) und hat schon einen deutschen Text
  in `apps/web/src/strings/de.ts` ("„{task}" ist jetzt freiwillig verfügbar —
  aktueller Wert {value}") — wird aber **nirgendwo emittiert**. Die
  naheliegende Emit-Stelle ist `runAssignmentSweep.ts`s T1/T2-Schritte
  (Materialisierung und Publish einer Instanz auf `AVAILABLE`), analog zu den
  bestehenden `TASK_ASSIGNED`/`TASK_TAKEN`-Aufrufen.
- **In-App-Polling**: `NotificationBell` pollt alle 30 Sekunden
  (`apps/web/src/api/hooks.ts`, `useNotifications`). Das deckt "Tab offen"
  vollständig ab — der eigentliche Lückenfall für Push ist "Tab/App
  geschlossen oder im Hintergrund", wofür 30-Sekunden-Polling naturgemäß
  nichts tut.
- **PWA-Grundlage existiert bereits**: `vite-plugin-pwa` in
  `apps/web/vite.config.ts`, aktuell für App-Update-Precaching genutzt
  (`registerType: 'prompt'`, App-Shell-only, keine `/api/*`-Caches — siehe
  Kommentar dort und das bereits erledigte Intake-Item
  "notify-on-new-deploy-and-refresh-cache"). Kein `strategies`-Override
  gesetzt → das ist der Workbox-Default `generateSW`.
- **Admin-Konfigurierbarkeit**: `notifications.inAppEnabled`
  (`packages/shared/src/config/{types,schema,defaults}.ts`) ist das
  bestehende Muster für einen Haushalts-Ein/Aus-Schalter — ein künftiges
  `notifications.pushEnabled` würde exakt diesem Muster folgen.
- **Multi-Household (§26)**: eine Person kann perspektivisch mehreren
  Haushalten angehören. Eine Push-Subscription gehört an sich zum
  Browser/Gerät, nicht zum Haushalt — das Subscription-Objekt selbst ist
  haushaltsunabhängig, nur die *Zustellentscheidung* ("für diesen Haushalt
  Push senden?") ist haushaltsspezifisch. Modellierung siehe unten.

## Option A: Web Push (VAPID) — empfohlen

**Was es ist**: Der Browser-Standard-Mechanismus (`Push API` +
`Notifications API`), unterstützt von allen modernen Browsern inklusive
iOS Safari (ab iOS 16.4, nur als installierte PWA — relevant, siehe
Einschränkungen). Der Server signiert Nachrichten mit einem VAPID-Schlüsselpaar
und sendet sie über den vom Browser bereitgestellten Push-Endpoint (Google
FCM, Mozilla Autopush, Apple Web Push, je nach Browser — für den Server
transparent, ein einziges standardisiertes Protokoll).

**Aufwand/Abhängigkeiten**:
- `web-push` (npm) — die einzige neue Backend-Abhängigkeit. Erzeugt
  VAPID-Schlüssel, signiert und versendet Push-Nachrichten. Reif, wenig
  Wartungsaufwand, keine Cloud-Anbindung nötig.
- Kein externer Dienst, kein API-Schlüssel, keine Kosten — im Unterschied zu
  Firebase Cloud Messaging (Option B, siehe unten). Genau der Vorteil, den
  §36 ("kein Zugriff auf fremde Haushalte") und die Selbstbetreibbarkeit
  dieser Anwendung ("betreibbar sein für eine Familie ohne eigenen
  Systemadministrator") wollen: keine dritte Partei, kein zusätzliches Konto
  einzurichten.
- Frontend: `PushSubscription`-Objekt via
  `registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })`
  — Standard-Browser-API, kein zusätzliches npm-Paket nötig.

**Einschränkungen, die den Vorschlag prägen**:
- iOS Safari verlangt "zum Homescreen hinzugefügt" (installierte PWA) für
  Push — im Browser-Tab funktioniert es dort nicht. Kein Blocker (§30 "PWA-
  fähig" ist bereits Ziel), aber eine UX-Erwartung, die im Opt-in-Dialog
  benannt werden sollte ("auf dem iPhone: erst zum Homescreen hinzufügen").
- Ein `PushSubscription`-Endpoint kann jederzeit ungültig werden (Browser-
  Neuinstallation, Berechtigung entzogen, …) — `web-push`s Sendeversuch wirft
  dann einen 404/410-Fehler. Muss best-effort behandelt werden: fehlgeschlagene
  Zustellung löscht die betroffene Subscription, blockiert aber nie den
  In-App-Pfad.

## Option B: Firebase Cloud Messaging — nicht empfohlen

Würde ein Google-Firebase-Projekt (Konto, Konfiguration, ggf. Kosten bei
Volumen) und ein zusätzliches SDK auf beiden Seiten voraussetzen. Kein
technischer Vorteil gegenüber Web Push für diesen Anwendungsfall (reiner
Browser-Push, keine native App), dafür eine externe Abhängigkeit, die exakt
der "für eine Familie ohne eigenen Systemadministrator betreibbar"-Anforderung
(§37) zuwiderläuft — ein Familienmitglied müsste ein Google-Cloud-Konto
einrichten, nur um Push zu aktivieren. Wird hier nur als Kontrastfolie
genannt, nicht weiterverfolgt.

## Architekturvorschlag

### Datenmodell

Ein neues, schlankes Modell, unabhängig vom Haushalt (siehe Multi-Household-
Punkt oben):

```prisma
model PushSubscription {
  id        String   @id @default(cuid())
  memberId  String   @map("member_id")
  endpoint  String   @unique
  p256dh    String
  auth      String
  createdAt DateTime @default(now()) @map("created_at")

  member HouseholdMember @relation(fields: [memberId], references: [id], onDelete: Cascade)

  @@index([memberId])
  @@map("push_subscriptions")
}
```

An `HouseholdMember` gebunden (nicht an `User`), weil eine Person pro
Haushalt unterschiedliche `maxRandomAssignmentsPerWeek` &c. hat und Push-
Zustellentscheidungen ("ist Push für diesen Haushalt aktiviert?") ohnehin
haushaltsspezifisch geprüft werden — ein Mitglied kann pro Haushalt separat
entscheiden, ob es Push für *diesen* Haushalt will, auch wenn dasselbe Gerät
für mehrere Haushalte registriert ist.

### Notifier-Erweiterung

Kein Umbau des bestehenden `Notifier`-Interfaces. Stattdessen ein
**Decorator**, der `dbNotifier` umschließt:

```ts
export const pushNotifier = (inner: Notifier, push: PushSender): Notifier => ({
  async emit(tx, drafts) {
    await inner.emit(tx, drafts); // unverändert: die transaktionale Garantie bleibt exakt wie heute
    // Best-effort, AUSSERHALB der Transaktion, nach dem Commit angestoßen —
    // ein Push-Fehlschlag darf niemals den In-App-Pfad oder die Transaktion
    // selbst gefährden. Feuert asynchron (z. B. über einen `afterCommit`-Hook
    // oder einen dünnen Sweep-artigen Poller, der offene `Notification`-Zeilen
    // ohne `pushedAt` abarbeitet — Details Phase 2).
  },
});
```

Das hält die bestehende `§24`-Garantie ("ein committeter Vorgang benachrichtigt
immer, ein zurückgerollter nie") unangetastet und macht Push zu einer reinen
Ergänzung, die bei jedem Fehler auf den bereits funktionierenden In-App-Pfad
zurückfällt — nie umgekehrt.

### Service-Worker-Strategiewechsel

`vite-plugin-pwa`s `generateSW` (aktueller, impliziter Modus) generiert die
Service-Worker-Datei automatisch aus einem Precache-Manifest und erlaubt
**keine eigenen Event-Listener**. Für `self.addEventListener('push', …)` und
`self.addEventListener('notificationclick', …)` ist `strategies:
'injectManifest'` mit einer eigenen `src/sw.ts`-Quelldatei nötig, die
`precacheAndRoute(self.__WB_MANIFEST)` (Workbox-Precaching, ersetzt das
bisherige `generateSW`-Verhalten 1:1) plus die eigenen Handler enthält. Das
ist der einzige Eingriff in die bestehende PWA-Konfiguration — alles andere
in diesem Vorschlag ist rein additiv.

### Admin-Konfigurierbarkeit

Neues Feld `notifications.pushEnabled: boolean` (Default `false` — reiner
Opt-in, analog zu jedem anderen additiven Feature in diesem Codebase),
exakt nach dem Muster von `notifications.inAppEnabled`.

## Phasenplan

**Phase 1 — Grundlage (kein sichtbares Feature)**
- `PushSubscription`-Modell + Migration.
- VAPID-Schlüsselpaar serverseitig erzeugen/konfigurieren (Umgebungsvariable,
  analog zu den bestehenden Secrets in `.env`).
- `POST /members/me/push-subscription` (anlegen) und `DELETE .../:id`
  (entfernen) — Endpunkte, kein UI.
- `web-push`-Abhängigkeit + ein minimaler `PushSender`-Port (analog zu
  `TodoistPort` in `apps/api/src/app/integrations/ports.js` — injiziert,
  nicht direkt aufgerufen, damit Tests ihn wie jeden anderen Port ersetzen
  können).

**Phase 2 — Zustellung für die zwei bestehenden Ereignisse**
- Service-Worker-Wechsel auf `injectManifest` mit `push`/`notificationclick`-
  Handlern.
- Opt-in-UI (z. B. unter „Ich" — Berechtigungsanfrage, mit dem iOS-Hinweis aus
  den Einschränkungen oben).
- `pushNotifier`-Decorator verdrahtet für `TASK_ASSIGNED` und `TASK_TAKEN` —
  bewusst zuerst nur diese zwei, weil sie schon In-App funktionieren und der
  Vergleich "kam die Push-Nachricht genauso an wie die In-App-Nachricht"
  einfach zu verifizieren ist.
- `notifications.pushEnabled`-Konfigurationsschalter.

**Phase 3 — `TASK_AVAILABLE` schließen und ausweiten**
- Die fehlende Emit-Stelle für `TASK_AVAILABLE` in `runAssignmentSweep.ts`s
  T1/T2 ergänzen (In-App *und* Push profitieren davon gleichzeitig — das ist
  keine reine Push-Arbeit, sondern eine eigenständige, schon lange fällige
  Lücke).
- Push für die übrigen bereits vorhandenen `NotificationType`-Werte
  (`TASK_DUE_SOON`, `TASK_VALUE_INCREASED`, `TASK_COMPLETED`,
  `ADMIN_NO_CANDIDATES`, …) nach Bedarf ergänzen — mechanisch, sobald der
  Decorator einmal steht.

## Offene Fragen für die Umsetzung (nicht Teil dieser Recherche)

- Granularität des Opt-in: ein globaler Schalter pro Mitglied, oder pro
  Ereignistyp (wie es `notifications.inAppEnabled` heute nur global tut)?
- Soll ein fehlgeschlagener Push (410 Gone) die `PushSubscription`-Zeile
  sofort löschen, oder erst nach N aufeinanderfolgenden Fehlschlägen?
