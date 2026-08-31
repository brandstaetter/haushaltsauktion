# Todoist-Integration — Betriebshandbuch

Vollständige Architekturbegründung:
[`.planning/architecture-todoist-integration.md`](../.planning/architecture-todoist-integration.md).
Dieses Dokument ist die Betriebssicht: einschalten, betreiben, Schlüssel
rotieren, Fehler deuten.

---

## Was die Integration tut — und was ausdrücklich nicht

**Sie tut:** Sobald eine Aufgabe *einer bestimmten Person gehört* — zufällig
zugewiesen oder freiwillig übernommen —, legt sie in deren Todoist eine Aufgabe
an. Endet die Zuständigkeit (erledigt, freigekauft, zurückgegeben, entzogen,
abgelaufen, abgelehnt), wird die Todoist-Aufgabe geschlossen.

**Sie tut ausdrücklich nicht:**

| Nicht unterstützt | Warum |
|---|---|
| **Rückrichtung Todoist → Haushaltsauktion** | Ein Häkchen in Todoist erledigt die Aufgabe hier **nicht**. Eine Erledigung verschiebt eine Zustandsmaschine, bucht ins Punkte-Ledger und setzt `currentValue` zurück (§28, §44). Ein externer Schreibpfad in diese Kette bräuchte ein eigenes Bedrohungsmodell — und wir könnten nicht einmal feststellen, *welches* Mitglied in einem geteilten Projekt abgehakt hat. |
| Kommentare, Unteraufgaben, Anhänge, Erinnerungen | Nicht im MVP-Umfang. |
| Gemeinsame Haushalts-Projekte | Jedes Mitglied verbindet sein eigenes Konto. |
| OAuth | Siehe unten. |

Die Einbahn-Beschränkung steht **in der Oberfläche vor dem Verbinden** und im
Text jeder erzeugten Todoist-Aufgabe. §31 verbietet versteckte Regeln; eine
Person, die glaubt, Abhaken in Todoist genüge, würde sonst unbemerkt Punkte und
Aufgabenwert verlieren.

## Warum persönliches Token statt OAuth

OAuth setzt eine registrierte Anwendung, ein Client-Secret und eine **öffentlich
erreichbare HTTPS-Redirect-URI** voraus. Diese Anwendung ist für „eine Familie
ohne eigene Systemadministration" gedacht (§37) und läuft typischerweise im
Heimnetz ohne öffentlichen DNS-Namen — OAuth-first wäre also für genau die
Zielgruppe unbenutzbar gewesen.

Ehrlich benannt: Ein persönliches Todoist-Token ist **nicht einschränkbar** und
gibt vollen Zugriff auf das Konto der Person. OAuth böte mit `task:add` deutlich
weniger Rechte. Der Tausch ist bewusst — Erreichbarkeit gegen Rechteumfang — und
deshalb steht die Tragweite in der Oberfläche, *bevor* jemand ein Token einfügt.
Datenmodell und HTTP-Header sind für beide Verfahren identisch (`Bearer`), OAuth
bleibt also additiv nachrüstbar.

---

## Einschalten

1. **Schlüssel erzeugen und setzen** (siehe nächster Abschnitt).
2. **Haushalt freischalten:** Verwaltung → Einstellungen → „Todoist-Integration
   für diesen Haushalt erlauben". Standard ist **aus**.
3. **Pro Person verbinden:** „Ich" → Todoist → persönliches API-Token einfügen.
   Zu finden in Todoist unter *Einstellungen → Integrationen → Entwickler*.
4. Optional Projekt und Auslöser wählen (zufällige Zuweisung / freiwillige
   Übernahme, beide standardmäßig an).

Der Worker gleicht danach höchstens einmal pro `TODOIST_INTERVAL_SECONDS` ab.

## Umgebungsvariablen

| Variable | Pflicht | Default | Zweck |
|---|---|---|---|
| `INTEGRATION_ENCRYPTION_KEY` | für die Integration | — | AES-256-GCM-Schlüssel für die Tokens. Base64, **genau 32 Byte**. |
| `INTEGRATION_ENCRYPTION_KEYS` | nein | — | Nur während einer Rotation: `1:<alt>,2:<neu>` |
| `TODOIST_INTERVAL_SECONDS` | nein | `60` | Reconcile+Dispatch-Intervall; `0` schaltet den Worker ab |

> **Fehlt `INTEGRATION_ENCRYPTION_KEY`, wird die Integration gar nicht erst
> zusammengesetzt** (`apps/api/src/main.ts`): kein Worker, keine Wirkung, **keine
> Fehlermeldung**. „Die Integration tut nichts" ist dann kein Defekt, sondern
> genau dieser fehlende Wert. Das ist der mit Abstand häufigste Stolperstein.
>
> Ein *fehlerhafter* Wert verhält sich umgekehrt: Der Prozess bricht schon beim
> Start ab. Das ist Absicht — ein Startfehler ist besser als ein Fehler beim
> ersten Verbindungsversuch eines Mitglieds.

Schlüssel erzeugen:

```bash
openssl rand -base64 32
```

Da `.env` in diesem Repo aus Sicherheitsgründen nicht durch Werkzeuge gelesen
oder geschrieben wird, muss der folgende Block **von Hand** in `.env` bzw.
`.env.example` ergänzt werden:

```dotenv
# Ohne diesen Wert ist die Integration inaktiv (ohne Fehlermeldung).
INTEGRATION_ENCRYPTION_KEY=
# Nur während einer Rotation: 1:<alt-base64>,2:<neu-base64>
INTEGRATION_ENCRYPTION_KEYS=
# `0` schaltet den Worker ab. Bei mehreren API-Instanzen: siehe unten.
TODOIST_INTERVAL_SECONDS=60
```

---

## Einzelinstanz-Bedingung beim Skalieren

**Der Reconciler muss genau einmal laufen.** Wird die API horizontal skaliert,
muss `TODOIST_INTERVAL_SECONDS` auf **allen Instanzen außer einer** auf `0`
stehen.

Grund: Die Prüfung „wurde dieses Mitglied schon benachrichtigt?" liest außerhalb
einer Zeilensperre. Zwei gleichzeitige Reconciler können deshalb

1. dieselbe Benachrichtigung doppelt senden, **und**
2. — über eine veraltete Lesung, die den bereits abgeschlossenen Versand der
   anderen Instanz nicht sieht — **eine doppelte Todoist-Aufgabe** anlegen. Der
   partielle Unique-Index schützt nur das *laufende* Intervall; eine bereits auf
   `SENT` stehende Zeile ist kein Konfliktpartner mehr, und der neue Auftrag
   trägt eine neue Command-`uuid`, die Todoists Deduplizierung nicht greifen
   lässt.

Punkt 2 ist ein **Korrektheitsproblem**, kein Schönheitsfehler. Eine frühere
Fassung dieses Dokuments behauptete das Gegenteil („nur eine doppelte
Benachrichtigung"); das war falsch und wurde im Architekturreview widerlegt.

**Vor dem Skalieren** ist ein haushaltsweiter Advisory-Lock nachzurüsten
(`acquireReconcileLock`, analog zu `acquireSweepLock` in `apps/api/src/app/tx.ts`),
registriert in `LOCK_LEVELS` auf Ebene 0. `TODOIST_INTERVAL_SECONDS=0` ist bis
dahin die belastbare Absicherung — eine Konfigurationstatsache statt einer
Hoffnung.

`0` schaltet übrigens den *Worker* ab, nicht jeden Todoist-Verkehr: Trennt sich
ein Mitglied auf dieser Instanz, wird weiterhin versucht, seine offenen Aufgaben
zu schließen.

---

## Schlüsselrotation

Die Tokens liegen AES-256-GCM-verschlüsselt; jede Zeile trägt ihre
`tokenKeyVersion`. Deshalb ist eine Rotation ohne Datenmigration möglich: alte
Zeilen bleiben lesbar, neue werden mit dem neuesten Schlüssel geschrieben.

**1. Neuen Schlüssel erzeugen**

```bash
openssl rand -base64 32
```

**2. Rotationsfenster öffnen** — beide Schlüssel gleichzeitig aktiv:

```dotenv
# Der alte Wert aus INTEGRATION_ENCRYPTION_KEY wird zu Version 1.
INTEGRATION_ENCRYPTION_KEYS=1:<alter-schluessel>,2:<neuer-schluessel>
```

`INTEGRATION_ENCRYPTION_KEY` wird ignoriert, sobald `…KEYS` gesetzt ist.
Die **höchste** Version verschlüsselt neu, **alle** aufgeführten entschlüsseln.
API neu starten.

**3. Neuverschlüsselung anstoßen.** Zeilen werden beim nächsten Schreibvorgang
neu versiegelt. Der verlässliche Weg ist, jedes Mitglied einmal neu verbinden zu
lassen; bei einer Familie ist das eine Nachricht, kein Migrationsjob.

Fortschritt prüfen:

```sql
SELECT token_key_version, count(*)
  FROM member_integrations
 WHERE token_ciphertext IS NOT NULL
 GROUP BY 1;
```

**4. Fenster schließen**, sobald nur noch die neue Version vorkommt:

```dotenv
INTEGRATION_ENCRYPTION_KEY=<neuer-schluessel>
INTEGRATION_ENCRYPTION_KEYS=
```

> **Das Fenster nicht zu früh schließen.** Eine Zeile mit einer Version, die im
> Keyring fehlt, ist unwiederbringlich: Das Token kann nicht mehr entschlüsselt
> werden, und das Mitglied muss neu verbinden. Der Dispatcher behandelt diesen
> Fall bewusst als *vorübergehend* (`KEY_UNAVAILABLE`) statt als `DEAD` — ein
> Neustart mit vollständigem Keyring repariert ihn, und `DEAD` wäre eine Lüge.

**Was Verschlüsselung hier leistet — und was nicht.** Sie schützt gegen eine
reine Datenbank-Kompromittierung: einen Dump, ein liegengebliebenes Backup, einen
wiederhergestellten Snapshot. Sie schützt **nicht** gegen jemanden, der Datenbank
*und* Prozessumgebung hat — dann ist auch der Schlüssel bekannt. Da bei einer
Familieninstallation App und Datenbank praktisch immer auf demselben Host laufen
(§37), ist das realistisch abgedeckte Risiko das **entwendete Backup**, nicht der
übernommene Server.

---

## Fehler deuten

| Anzeige / Zustand | Bedeutung | Was tun |
|---|---|---|
| Abschnitt fehlt in „Ich" | Haushaltsschalter aus | Verwaltung → Einstellungen |
| Alles ruhig, keine Aufgaben, keine Fehler | `INTEGRATION_ENCRYPTION_KEY` fehlt | Schlüssel setzen, API neu starten |
| „Todoist hat dein Token abgelehnt" | 401/403 — Verbindung steht auf `INVALID_CREDENTIALS` | Neu verbinden. Bis dahin wird bewusst **nichts** übertragen: Die Ursache entzieht die Verbindung dem Soll-Zustand. |
| „wiederholt fehlgeschlagen" | 3 Fehlversuche in 24 h für denselben Vorgang | Meist ein längerer Todoist-Ausfall. Der Deckel löst sich von selbst, sobald die Zeilen aus dem 24-h-Fenster fallen. |
| Aufgabe wurde angelegt, ist aber nicht verwaltbar | `ORPHANED` — Todoist bestätigte, lieferte aber keine ID | Die Aufgabe in Todoist von Hand entfernen. Sollte praktisch nie auftreten (siehe unten). |
| Aufgabe bleibt nach dem Trennen stehen | Erwartetes Verhalten | Beim Trennen wird versucht zu schließen; unerreichbare Aufgaben bleiben stehen, weil danach kein Zugriff mehr besteht. Steht so im Bestätigungsdialog. |

Ein Mitglied wird bei dauerhaftem Scheitern **immer benachrichtigt** (genau
einmal je Vorgang). Stilles Dauerversagen wäre der schlimmste Ausgang: Die Person
glaubt, ihre Aufgaben stünden in Todoist, und sie stehen dort nicht.

---

## Nicht verifiziert: der echte Ende-zu-Ende-Durchlauf

**Ehrlich benannter Restpunkt.** Der vollständige Zyklus *verbinden → zuweisen →
abgleichen → zustellen → Aufgabe erscheint in Todoist* wurde **nie gegen den
echten Dienst ausgeführt**. Alle automatisierten Tests verwenden einen injizierten
Fake.

Live *bestätigt* wurde ein schmalerer, aber echter Ausschnitt:

- der Sync-Endpunkt und sein Request/Response-Format,
- die Deduplizierung über die Command-`uuid` — ein wiederholtes Kommando liefert
  **dieselbe** `temp_id_mapping`-ID zurück und legt **keine** zweite Aufgabe an,
- die 401-Fehlerhülle (inklusive der überraschenden Erkenntnis, dass Todoist auch
  auf 401 einen `Retry-After` sendet),
- dass der abgekündigte v2-REST-Pfad live **410 Gone** liefert.

Weil die Deduplizierung die ID zurückgibt, schließt sich das Absturzfenster von
selbst; der `ORPHANED`-Pfad bleibt als Absicherung bestehen, ist aber
voraussichtlich toter Code — die Behauptung ist undokumentiert und wurde einmalig
gemessen, nicht zugesichert.

**So verifiziert man es, sobald ein Token vorliegt:**

1. Haushaltsschalter an, ein Mitglied verbinden.
2. Aufgabe erzeugen und dieser Person zuweisen (oder freiwillig übernehmen).
3. Ein Worker-Intervall abwarten (Standard 60 s).
4. Prüfen: Aufgabe in Todoist sichtbar **und**

```sql
SELECT assignment_id, external_task_id, closed_at
  FROM integration_task_links
 WHERE household_id = '<id>' AND closed_at IS NULL;
```

`external_task_id` muss gesetzt sein. Danach die Aufgabe in der
Haushaltsauktion erledigen und prüfen, dass sie in Todoist geschlossen wird und
`closed_at` gesetzt ist.

---

## Laufende Container neu bauen

Die derzeit laufenden Compose-Images stammen aus der Zeit **vor** dieser
Integration und enthalten sie überhaupt nicht. Wer die Funktion über den
laufenden Stack ausprobiert, sieht sie nicht — unabhängig von der Konfiguration:

```bash
docker compose build api web
docker compose up -d
```

Die Datenbankmigration ist bereits angewendet; `npm run db:migrate` ist nur auf
frischen Umgebungen nötig.
