Unten ist eine Spezifikation, die du direkt als Projektauftrag in Claude Code verwenden kannst. Sie ist absichtlich so formuliert, dass Opus die Gesamtkoordination übernimmt und Subagents für Architektur, UI, Implementierung und Tests einsetzt.

# Projektauftrag: Webapplikation „Haushaltsauktion“

## 1. Ziel

Erstelle eine moderne Webapplikation zur fairen und spielerischen Verteilung von Haushaltsaufgaben innerhalb einer Familie oder kleinen Gruppe.

Das System basiert auf folgenden Grundprinzipien:

* Aufgaben können freiwillig übernommen werden.
* Nur freiwillige Übernahmen erzeugen Punkte.
* Nicht freiwillig übernommene Aufgaben werden zufällig Personen zugewiesen.
* Eine zufällig zugewiesene Aufgabe bringt bei Erledigung keine Punkte.
* Eine zufällig zugewiesene Aufgabe kann gegen Zahlung von Punkten abgelehnt werden.
* Nach einer Ablehnung steigt der aktuelle Wert der Aufgabe.
* Die Aufgabe wird anschließend erneut angeboten und gegebenenfalls erneut zufällig vergeben.
* Nach erfolgreicher Erledigung wird der Aufgabenwert auf seinen Basiswert zurückgesetzt.
* Sämtliche relevanten Regeln und Parameter müssen administrativ frei konfigurierbar sein.

Die Anwendung soll so gestaltet sein, dass möglichst wenig manuelle Administration notwendig ist und das System langfristig nachvollziehbar und fair bleibt.

---

# 2. Arbeitsweise mit Claude Code

Claude Code soll für dieses Projekt:

* Claude Opus als Default-/Hauptmodell verwenden.
* Die Gesamtarchitektur und Koordination durch den Hauptagenten durchführen.
* Geeignete Teilaufgaben konsequent an Subagents delegieren.
* Parallele Subagents verwenden, wenn Tasks unabhängig voneinander bearbeitet werden können.
* Ergebnisse der Subagents durch den Hauptagenten überprüfen, integrieren und gegebenenfalls korrigieren lassen.
* Keine größeren Architekturentscheidungen ungeprüft von einzelnen Subagents übernehmen.

Mindestens folgende Rollen sollen als Subagents verwendet werden:

### Architecture Agent

Verantwortlich für:

* Systemarchitektur
* Domainmodell
* Persistenzmodell
* API-Design
* State Machine der Aufgaben
* Konfigurationsmodell
* Race Conditions und Konsistenzregeln

### Frontend Agent

Verantwortlich für:

* UX-Konzept
* responsive UI
* Komponentenarchitektur
* Bedienbarkeit auf Smartphones
* Dashboard
* Aufgabenansicht
* Auktions-/Zufallsvergabe-UI
* Administrationsoberfläche

### Backend Agent

Verantwortlich für:

* Businesslogik
* Persistenz
* API
* Zufallsvergabe
* Punktebuchhaltung
* Aufgabenstatus
* Konfiguration
* Audit Log

### Testing Agent

Verantwortlich für:

* Unit Tests
* Integrationstests
* End-to-End-Tests
* Grenzfälle
* probabilistische Tests der Zufallsvergabe
* Tests der Punkte- und Wertlogik
* Race-Condition-Szenarien

### Review Agent

Verantwortlich für:

* Code Review
* Architekturreview
* Security Review
* Konsistenzprüfung
* Identifikation unnötiger Komplexität
* Abgleich mit dieser Spezifikation

Falls sinnvoll, dürfen weitere spezialisierte Subagents angelegt werden.

---

# 3. Kernkonzept

## 3.1 Personen

Das System verwaltet Mitglieder einer Gruppe.

Eine Person besitzt mindestens:

* ID
* Anzeigename
* optional Avatar
* aktiv/inaktiv
* aktuellen Punktestand
* Rolle:

  * MEMBER
  * ADMIN
* optionale Teilnahmebeschränkungen

Beispiele für Teilnahmebeschränkungen:

* bestimmte Aufgabenkategorien ausgeschlossen
* einzelne Aufgaben ausgeschlossen
* vorübergehend nicht verfügbar
* maximale Anzahl zufälliger Zuweisungen pro Zeitraum

---

# 3.2 Aufgaben

Eine Aufgabe besitzt mindestens:

* ID
* Titel
* Beschreibung
* Kategorie
* Basiswert
* aktueller Wert
* Aktivstatus
* Wiederholungsregel
* optional Fälligkeit
* optionale Dauer-/Aufwandsschätzung
* mögliche Personen
* ausgeschlossene Personen
* Status
* Erstellungszeitpunkt
* letzte Erledigung
* optional nächste Fälligkeit

Beispiele:

* Geschirrspüler ausräumen
* Müll hinausbringen
* Bad putzen
* Staubsaugen
* Wäsche aufhängen
* Küche reinigen

---

# 4. Aufgabenstatus

Die Businesslogik soll als explizite State Machine modelliert werden.

Mindestens folgende Status:

* DRAFT
* AVAILABLE
* ASSIGNED
* COMPLETED
* CANCELLED
* PAUSED

Optional sinnvoll:

* EXPIRED
* OVERDUE

Typischer Ablauf:

AVAILABLE
→ freiwillige Übernahme
→ COMPLETED

oder:

AVAILABLE
→ keine freiwillige Übernahme
→ ASSIGNED
→ akzeptiert
→ COMPLETED

oder:

AVAILABLE
→ ASSIGNED
→ Freikauf
→ AVAILABLE mit erhöhtem aktuellem Wert

---

# 5. Freiwillige Übernahme

Eine verfügbare Aufgabe kann von einer berechtigten Person freiwillig übernommen werden.

Regeln:

* Die Person erhält den aktuellen Aufgabenwert als Punkte.
* Die Übernahme muss eindeutig atomar erfolgen.
* Zwei Personen dürfen dieselbe Aufgabe nicht gleichzeitig übernehmen können.
* Optional kann eine Bestätigung der tatsächlichen Erledigung erforderlich sein.
* Der Punktgewinn kann entweder bei Übernahme oder erst nach bestätigter Erledigung erfolgen.

Dieser Zeitpunkt muss konfigurierbar sein.

Konfigurationsoption:

```text
voluntaryRewardTiming:
  ON_ACCEPT
  ON_COMPLETE
```

Empfohlener Default:

```text
ON_COMPLETE
```

---

# 6. Zufallszuweisung

Wenn eine Aufgabe innerhalb einer konfigurierbaren Zeit nicht freiwillig übernommen wurde, kann sie zufällig zugewiesen werden.

Die Zufallsvergabe muss nur aus aktuell zulässigen Personen auswählen.

Ausschlusskriterien können sein:

* Person ist inaktiv.
* Person ist für diese Aufgabe ausgeschlossen.
* Person ist für diese Kategorie ausgeschlossen.
* Person ist aktuell abwesend.
* Person hat die Aufgabe unmittelbar davor bereits zugelost bekommen.
* Person hat ihre maximale Anzahl zufälliger Zuweisungen erreicht.
* Weitere konfigurierte Fairnessregeln.

Die Zufallsauswahl muss technisch nachvollziehbar sein.

Im Audit Log sollen festgehalten werden:

* mögliche Kandidaten
* ausgeschlossene Kandidaten
* Ausschlussgrund
* ausgewählte Person
* verwendete Auswahlstrategie

---

# 7. Punkte bei zufälliger Zuweisung

Wird eine zufällig zugewiesene Aufgabe erledigt:

```text
Punkteänderung = 0
```

Das ist eine zentrale Geschäftsregel.

Es gibt keine Belohnung für die reguläre Erledigung einer zufällig zugewiesenen Aufgabe.

---

# 8. Freikaufen

Eine zufällig zugewiesene Aufgabe kann abgelehnt werden.

Dafür werden Punkte vom Konto der Person abgezogen.

Der Preis muss frei konfigurierbar sein.

Unterstütze mindestens folgende Modelle:

```text
FIXED
CURRENT_TASK_VALUE
MULTIPLIER
FORMULA
```

Beispiele:

```text
CURRENT_TASK_VALUE
```

oder:

```text
currentValue * 1.5
```

Der Default soll sein:

```text
buyoutCost = currentTaskValue
```

Eine Person darf sich nur freikaufen, wenn dies nach den konfigurierten Regeln erlaubt ist.

Konfigurierbar:

* negativer Punktestand erlaubt: ja/nein
* Mindestpunktestand
* maximales Minus
* maximale Freikäufe pro Woche
* maximale aufeinanderfolgende Freikäufe
* Freikauf bei bestimmten Aufgaben deaktiviert

---

# 9. Wertsteigerung nach Freikauf

Nach einem Freikauf steigt der aktuelle Aufgabenwert.

Die Steigerungslogik muss vollständig konfigurierbar sein.

Unterstütze mindestens:

```text
FIXED_INCREMENT
PERCENTAGE
MULTIPLIER
CUSTOM_FORMULA
```

Beispiele:

### Fix

```text
newValue = currentValue + 2
```

### Prozent

```text
newValue = ceil(currentValue * 1.5)
```

### Multiplikator

```text
newValue = ceil(currentValue * 1.25)
```

Default:

```text
newValue = ceil(currentValue * 1.5)
```

Optional konfigurierbar:

```text
minimumIncrease = 1
maximumTaskValue = unlimited
```

---

# 10. Neuer Angebotszyklus

Nach einem Freikauf:

1. Punkte werden abgezogen.
2. aktueller Aufgabenwert wird erhöht.
3. bisherige Zuweisung wird beendet.
4. Aufgabe erhält wieder Status AVAILABLE.
5. alle berechtigten Personen können sie freiwillig übernehmen.
6. wenn niemand übernimmt, erfolgt nach Ablauf einer konfigurierbaren Frist erneut eine Zufallszuweisung.

---

# 11. Reset nach Erledigung

Nach erfolgreicher Erledigung:

```text
currentValue = baseValue
```

Dies soll Default-Verhalten sein.

Administrativ konfigurierbar:

```text
resetValueAfterCompletion: true | false
```

Optional:

```text
resetStrategy:
  BASE_VALUE
  DECREASE_PERCENTAGE
  KEEP_CURRENT
```

---

# 12. Fairness bei Zufallsvergabe

Die Auswahlstrategie muss konfigurierbar sein.

Unterstütze mindestens:

### PURE_RANDOM

Jede berechtigte Person besitzt dieselbe Wahrscheinlichkeit.

### WEIGHTED_RANDOM

Gewichtung anhand konfigurierbarer Kriterien.

Mögliche Kriterien:

* Anzahl zufälliger Aufgaben dieser Woche
* Anzahl freiwilliger Aufgaben
* Gesamtaufwand
* zuletzt erfolgte Zuweisung
* Anzahl Freikäufe
* Anzahl erledigter Aufgaben

### LEAST_ASSIGNED_FIRST

Bevorzugt Personen mit den wenigsten bisherigen Zufallszuweisungen.

### WEIGHTED_FAIRNESS

Wahrscheinlichkeit wird dynamisch anhand der bisherigen Belastung angepasst.

Die Auswahlstrategie soll über Administration änderbar sein.

Default:

```text
WEIGHTED_FAIRNESS
```

Die genaue Formel soll konfigurierbar und dokumentiert sein.

---

# 13. Vermeidung wiederholter Zuweisung

Es soll konfigurierbar sein, ob dieselbe Person dieselbe Aufgabe mehrfach hintereinander zugelost bekommen darf.

Default:

```text
preventImmediateReassignment = true
```

Optionale Regel:

```text
reassignmentCooldown = 1 cycle
```

---

# 14. Punktebuchhaltung

Punkte dürfen niemals einfach als numerischer Wert ohne Historie verändert werden.

Alle Änderungen müssen über ein Ledger erfolgen.

Entity:

```text
PointTransaction
```

Felder:

* ID
* Person
* Betrag
* alter Saldo
* neuer Saldo
* Typ
* Task-ID
* Assignment-ID
* Beschreibung
* Zeitpunkt
* Initiator

Transaktionstypen:

```text
VOLUNTARY_TASK_REWARD
BUYOUT
MANUAL_ADJUSTMENT
DECAY
BONUS
PENALTY
CORRECTION
```

Der aktuelle Punktestand kann aus dem Ledger berechnet oder performant gecached werden.

Ledger ist die Source of Truth.

---

# 15. Punktverfall

Punktverfall muss optional konfigurierbar sein.

Unterstütze:

```text
NONE
PERCENTAGE
FIXED
MAX_BALANCE
```

Beispiel:

```text
20 % pro Woche
```

Konfigurationsparameter:

```text
pointDecay.enabled
pointDecay.type
pointDecay.value
pointDecay.interval
pointDecay.minimumBalance
```

Default:

```text
disabled
```

---

# 16. Konfigurationssystem

Alle relevanten Spielregeln sollen administrativ änderbar sein.

Konfigurationen sollen nicht im Code hart verdrahtet sein.

Mindestens folgende Einstellungen:

```yaml
tasks:
  resetValueAfterCompletion: true

voluntary:
  rewardEnabled: true
  rewardMultiplier: 1.0
  rewardTiming: ON_COMPLETE

assignment:
  strategy: WEIGHTED_FAIRNESS
  preventImmediateReassignment: true
  offerDurationMinutes: 60

buyout:
  enabled: true
  costStrategy: CURRENT_TASK_VALUE
  multiplier: 1.0
  allowNegativeBalance: false
  minimumBalance: 0
  maximumBuyoutsPerWeek: null

valueIncrease:
  strategy: MULTIPLIER
  multiplier: 1.5
  minimumIncrease: 1
  maximumValue: null

points:
  decay:
    enabled: false

fairness:
  randomAssignmentWeight: 1
  voluntaryWorkWeight: 0
  recentAssignmentPenalty: 1
```

Diese Struktur ist nur eine Empfehlung.

Das tatsächliche Domainmodell darf sinnvoller gestaltet werden.

---

# 17. Administrative Konfiguration

Admins benötigen eine GUI, über die Regeln ohne Deployment geändert werden können.

Dazu gehören:

* Basiswerte
* Wertsteigerung
* Freikaufskosten
* Punktelimits
* Punktverfall
* Zufallsstrategie
* Fairnessgewichtung
* Angebotsdauer
* Wiederholungsregeln
* Teilnahmebeschränkungen
* Aufgabenkategorien
* Benutzer
* Rollen

Änderungen sollen validiert werden.

Komplexe Formeln dürfen nur über eine sichere, eingeschränkte Ausdruckssprache konfigurierbar sein.

Kein eval(), JavaScript eval oder vergleichbarer Mechanismus.

---

# 18. Aufgabenwiederholung

Aufgaben sollen optional wiederkehrend sein.

Unterstütze mindestens:

* einmalig
* täglich
* bestimmte Wochentage
* wöchentlich
* alle N Tage
* monatlich
* manuell

Beispiele:

```text
Müll: Montag und Donnerstag
Bad putzen: jede Woche
Geschirrspüler: täglich
Keller: einmal pro Monat
```

---

# 19. Dashboard

Die Startseite soll primär für Smartphone-Nutzung optimiert sein.

Sie zeigt mindestens:

### Für mich

* mein Punktestand
* aktuell zugewiesene Aufgaben
* Freikaufmöglichkeit
* freiwillig verfügbare Aufgaben
* nächste Fälligkeiten

### Familie

* aktuelle offene Aufgaben
* aktueller Aufgabenwert
* aktuelle Freiwilligenangebote
* kürzlich erledigte Aufgaben

Optional:

* Wochenstatistik
* Rangliste
* Fairnessindikator

Eine Rangliste darf nicht im Zentrum der UX stehen.

Das Ziel ist Kooperation, nicht Wettbewerb.

---

# 20. Ansicht „Offene Aufgaben“

Jede Aufgabe als Card mit:

* Titel
* Kategorie
* aktueller Wert
* Basiswert
* Fälligkeit
* Dauer
* bisherige Freikäufe
* Status

Call-to-Action:

```text
Freiwillig übernehmen
```

Nach Übernahme:

```text
Erledigt
```

---

# 21. Zugewiesene Aufgabe

Bei einer zufällig zugewiesenen Aufgabe:

Anzeige:

```text
Du wurdest ausgewählt:
Bad putzen

Aktueller Wert: 6

Erledigen:
0 Punkte

Freikaufen:
-6 Punkte
```

Buttons:

```text
Aufgabe übernehmen
Für 6 Punkte freikaufen
```

Bei Freikauf zusätzlich anzeigen:

```text
Danach steigt der Aufgabenwert auf 9 Punkte.
```

Der Benutzer soll vor der Entscheidung exakt sehen, welche Konsequenzen entstehen.

---

# 22. Historie

Es soll eine nachvollziehbare Historie geben.

Beispiel:

```text
19:01 Bad putzen wurde angeboten – Wert 4
19:43 Keine freiwillige Übernahme
19:43 Zufallszuweisung an Anna
19:45 Anna kaufte sich für 4 Punkte frei
19:45 Neuer Wert: 6
20:01 Aufgabe freiwillig von Paul übernommen
20:37 Aufgabe von Paul erledigt
20:37 Paul erhält 6 Punkte
20:37 Aufgabenwert auf 4 zurückgesetzt
```

---

# 23. Audit Log

Administrative und systemkritische Aktionen müssen auditierbar sein.

Mindestens:

* Konfigurationsänderungen
* Punkteänderungen
* Aufgabenzuweisungen
* Freikäufe
* manuelle Korrekturen
* Mitgliederänderungen
* zufällige Auswahl

---

# 24. Benachrichtigungen

Architektur für Benachrichtigungen vorsehen.

Mögliche Kanäle:

* In-App
* Push/PWA
* E-Mail

Mögliche Events:

* neue Aufgabe verfügbar
* Aufgabe zufällig zugewiesen
* Aufgabe wird bald fällig
* Wert einer Aufgabe ist gestiegen
* Aufgabe wurde erledigt

Initial muss mindestens In-App unterstützt werden.

---

# 25. Authentifizierung

Die Anwendung ist für kleine private Gruppen gedacht.

Mindestens unterstützen:

* Benutzername/Passwort oder Passwordless Login
* sichere Sessions
* Rollen MEMBER / ADMIN

Optional vorbereiten:

* OAuth/OIDC

---

# 26. Mehrere Haushalte

Die Architektur soll Multi-Household unterstützen.

Eine Person kann perspektivisch Mitglied mehrerer Haushalte sein.

Alle Daten müssen daher eindeutig einem Household zugeordnet werden.

Entity:

```text
Household
```

mit:

* ID
* Name
* Mitglieder
* Konfiguration
* Aufgaben
* Ledger

---

# 27. Empfohlenes Domainmodell

Mindestens folgende Entities prüfen:

```text
Household
User
HouseholdMember
TaskDefinition
TaskInstance
TaskAssignment
PointTransaction
TaskHistoryEvent
Configuration
Notification
AuditEvent
```

Wichtig:

TaskDefinition und konkrete TaskInstance sollten getrennt werden.

Beispiel:

```text
TaskDefinition:
Bad putzen – jeden Samstag

TaskInstance:
Bad putzen – 29.08.2026
```

---

# 28. Konsistenzanforderungen

Folgende Vorgänge müssen atomar sein:

### Freiwillige Übernahme

Gleichzeitig:

* Task reservieren
* Assignment erzeugen
* Status ändern

### Freikauf

Gleichzeitig:

* Punktestand prüfen
* Punkte abbuchen
* Assignment schließen
* aktuellen Wert erhöhen
* Aufgabe wieder freigeben
* Historie schreiben

### Abschluss

Gleichzeitig:

* Assignment abschließen
* gegebenenfalls Punkte gutschreiben
* Task abschließen
* aktuellen Wert zurücksetzen
* Historie schreiben

Race Conditions explizit berücksichtigen.

---

# 29. API

Entwirf eine saubere REST- oder vergleichbare API.

Beispielendpunkte:

```text
GET /api/tasks/available
GET /api/tasks/assigned-to-me
POST /api/tasks/{id}/volunteer
POST /api/tasks/{id}/complete
POST /api/assignments/{id}/buyout

GET /api/members/me/points
GET /api/members/me/point-transactions

GET /api/history

GET /api/admin/config
PUT /api/admin/config

POST /api/admin/tasks
PUT /api/admin/tasks/{id}

POST /api/admin/assignments/run
```

Das endgültige API-Design soll der Architecture Agent erstellen.

---

# 30. Technische Architektur

Wenn kein bestehender Stack vorgegeben ist, verwende bevorzugt einen pragmatischen, wartbaren Stack.

Vorschlag:

### Frontend

```text
React
TypeScript
Vite oder Next.js
responsive
PWA-fähig
```

### Backend

Entweder:

```text
TypeScript
Node.js
```

oder, falls architektonisch sinnvoller:

```text
Kotlin oder Java
Spring Boot
```

### Datenbank

```text
PostgreSQL
```

### Deployment

Containerfähig:

```text
Docker
Docker Compose
```

Lokales Starten soll mit einem einzelnen dokumentierten Kommando möglich sein.

Keine unnötige Microservice-Architektur.

Bevorzuge einen modularen Monolithen.

---

# 31. UX-Prinzipien

Die Anwendung soll:

* mobil zuerst gedacht sein
* wenige Klicks benötigen
* nachvollziehbar sein
* keine versteckten Regeln haben
* Konsequenzen einer Aktion vorab anzeigen
* spielerisch wirken, aber nicht kindlich
* keine manipulativen Dark Patterns verwenden

Besonders wichtig:

Der Benutzer muss vor einem Freikauf sehen:

```text
Aktueller Punktestand
Freikaufkosten
Punktestand danach
Aufgabenwert vorher
Aufgabenwert danach
```

---

# 32. Fairness-Transparenz

Es soll eine Ansicht geben:

```text
Warum wurde mir diese Aufgabe zugewiesen?
```

Sie kann beispielsweise anzeigen:

```text
Für diese Aufgabe waren 4 Personen verfügbar.

Anna wurde ausgeschlossen:
hat diese Aufgabe zuletzt erledigt.

Paul:
Gewicht 0,8

Maria:
Gewicht 1,2

Hannes:
Gewicht 1,0

Auswahl erfolgte zufällig anhand dieser Gewichtung.
```

Die Zufallszahl selbst muss nicht zwingend angezeigt werden.

---

# 33. Statistik

Optional beziehungsweise zweite Ausbaustufe:

* freiwillig erledigte Aufgaben
* zufällig erledigte Aufgaben
* Anzahl Freikäufe
* verdiente Punkte
* ausgegebene Punkte
* Aufgabenverteilung
* Kategorien
* durchschnittlicher tatsächlicher Aufgabenwert
* durchschnittliche Anzahl Freikäufe

Interessanter Wert:

```text
Market Value
```

Dieser kann aus den langfristigen tatsächlichen Übernahmewerten einer Aufgabe berechnet werden.

Damit kann die Anwendung beispielsweise anzeigen:

```text
Basiswert Bad putzen: 4
Durchschnittlicher freiwilliger Übernahmewert: 7,3
```

Der Administrator kann daraus Basiswerte optimieren.

---

# 34. Simulation

Erstelle zusätzlich ein kleines Simulationsmodul für Entwicklung und Tests.

Damit sollen beispielsweise:

```text
4 Personen
20 Aufgaben
1000 Zuweisungszyklen
```

simuliert werden können.

Analysiere:

* Verteilung zufälliger Aufgaben
* Punktentwicklung
* Häufigkeit von Freikäufen
* Entwicklung der Aufgabenwerte
* systematische Bevorzugung/Benachteiligung einzelner Personen

Die Simulation darf ein Developer Tool oder Test Utility sein.

---

# 35. Tests

Mindestens folgende Cases automatisiert testen.

### Freiwillige Übernahme

```text
Task Wert 6
User übernimmt freiwillig
Task wird erledigt
User erhält +6
```

### Zufallsaufgabe

```text
Task Wert 6
Task wird zufällig zugewiesen
User erledigt Task
User erhält 0
```

### Freikauf

```text
Task Wert 6
User hat 10 Punkte
User kauft sich frei

Ergebnis:
User hat 4 Punkte
Task Wert steigt gemäß Konfiguration
Task wird wieder AVAILABLE
```

### Nicht genügend Punkte

```text
Task Wert 6
User hat 4 Punkte
negative Balance disabled

Freikauf muss abgelehnt werden
```

### Mehrfacher Freikauf

```text
Task:
4 → 6 → 9 → 14
```

entsprechend konfigurierter Rundungsregel.

### Erledigung nach Wertsteigerung

```text
Task Basiswert 4
aktueller Wert 9
User übernimmt freiwillig
User erledigt
User erhält 9
Task currentValue wird wieder 4
```

### Parallelzugriff

Zwei Benutzer versuchen gleichzeitig dieselbe Aufgabe freiwillig zu übernehmen.

Genau einer darf erfolgreich sein.

---

# 36. Security

Berücksichtige mindestens:

* sichere Authentifizierung
* Authorization auf Household-Ebene
* kein Zugriff auf fremde Haushalte
* CSRF falls relevant
* XSS
* sichere Passwortspeicherung
* serverseitige Validierung
* Rate Limits für kritische Aktionen
* keine clientseitig manipulierbaren Punktestände
* keine clientseitige Berechnung verbindlicher Freikaufpreise

Businesslogik ist ausschließlich serverseitig verbindlich.

---

# 37. Nichtfunktionale Anforderungen

Die Anwendung soll:

* lokal einfach startbar sein
* verständlich strukturierten Code besitzen
* vollständig typisiert sein
* automatische Tests besitzen
* DB-Migrationen verwenden
* Logging besitzen
* keine unnötigen Framework-Abstraktionen verwenden
* für eine Familie ohne eigenen Systemadministrator betreibbar sein

---

# 38. Seed-Daten

Erzeuge Demo-Daten.

Household:

```text
Demo Family
```

Mitglieder:

```text
Elke
Arthur
Luise
Hannes
```

Aufgaben:

```text
Geschirrspüler ausräumen – 2
Müll hinausbringen – 2
Wäsche aufhängen – 4
Staubsaugen – 4
Bad putzen – 6
Küche gründlich reinigen – 7
```

---

# 39. Default-Konfiguration

Verwende initial folgende Defaults:

```yaml
voluntary:
  rewardMultiplier: 1.0
  rewardTiming: ON_COMPLETE

randomAssignment:
  strategy: WEIGHTED_FAIRNESS
  preventImmediateReassignment: true

buyout:
  enabled: true
  costStrategy: CURRENT_TASK_VALUE
  allowNegativeBalance: false

valueIncrease:
  strategy: MULTIPLIER
  multiplier: 1.5
  rounding: CEIL
  minimumIncrease: 1

completion:
  resetValueToBase: true

pointDecay:
  enabled: false
```

---

# 40. MVP

Implementiere zunächst einen vollständigen vertikalen MVP.

Der MVP muss enthalten:

1. Household
2. Mitglieder
3. Aufgaben
4. Basiswert / aktueller Wert
5. freiwillige Übernahme
6. Punktegutschrift nach freiwilliger Erledigung
7. zufällige Zuweisung
8. keine Punkte für zufällig erledigte Aufgaben
9. Freikauf
10. Wertsteigerung
11. erneute Freigabe
12. Reset nach Erledigung
13. Punkte-Ledger
14. Historie
15. Administration der wichtigsten Parameter
16. responsive Weboberfläche
17. automatisierte Tests

Erst danach zusätzliche Features implementieren.

---

# 41. Vorgehensweise

Arbeite iterativ.

## Phase 1 – Analyse

Architecture Agent soll:

* Domain analysieren
* Inkonsistenzen identifizieren
* State Machine erstellen
* Datenmodell erstellen
* Architekturvorschlag erstellen

Hauptagent überprüft den Vorschlag.

## Phase 2 – UX

Frontend Agent erstellt:

* Informationsarchitektur
* wichtigste Screens
* User Flows
* Komponentenmodell

## Phase 3 – Backend Skeleton

Backend Agent erstellt:

* Datenmodell
* Migrationen
* Services
* API
* zentrale Businesslogik

## Phase 4 – Frontend

Frontend Agent implementiert gegen reale API.

Keine dauerhaft gemockte Parallelarchitektur.

## Phase 5 – Tests

Testing Agent implementiert:

* Domain Tests
* Integrationstests
* E2E-Tests

## Phase 6 – Review

Review Agent prüft:

* Implementierung gegen Spezifikation
* Security
* Konsistenz
* Wartbarkeit
* unnötige Komplexität

## Phase 7 – Abschluss

Hauptagent:

* behebt Review Findings
* führt Tests aus
* dokumentiert Anwendung
* erstellt README
* dokumentiert lokale Installation
* dokumentiert Konfiguration

---

# 42. Definition of Done

Das Projekt gilt erst als abgeschlossen, wenn:

```text
✓ Anwendung lokal startet
✓ Datenbank automatisch initialisiert werden kann
✓ Seed-Daten funktionieren
✓ Login funktioniert
✓ offene Aufgaben sichtbar sind
✓ freiwillige Übernahme funktioniert
✓ freiwillige Erledigung Punkte erzeugt
✓ Zufallsvergabe funktioniert
✓ zufällige Erledigung keine Punkte erzeugt
✓ Freikauf funktioniert
✓ Punkte korrekt abgezogen werden
✓ Aufgabenwert korrekt steigt
✓ Aufgabe erneut angeboten wird
✓ Wert nach Erledigung zurückgesetzt wird
✓ Punkte-Ledger vollständig ist
✓ Historie nachvollziehbar ist
✓ Kernparameter administrativ konfigurierbar sind
✓ Race Conditions abgesichert sind
✓ automatisierte Tests erfolgreich laufen
✓ mobile Darstellung funktioniert
✓ README vollständig ist
```

---

# 43. Entscheidungsprinzipien

Bei Architekturentscheidungen gelten folgende Prioritäten:

1. Korrektheit der Geschäftslogik
2. Nachvollziehbarkeit
3. einfache Bedienung
4. Wartbarkeit
5. Testbarkeit
6. Konfigurierbarkeit
7. Performance
8. Erweiterbarkeit

Vermeide Overengineering.

Die erwartete Größenordnung ist zunächst:

```text
1–20 Mitglieder pro Household
10–500 TaskDefinitions
wenige tausend TaskInstances pro Jahr
```

Es ist keine Hochlastplattform.

---

# 44. Wichtige fachliche Invarianten

Diese Regeln dürfen durch keine Konfiguration unbeabsichtigt verletzt werden:

```text
Eine zufällig zugewiesene und erledigte Aufgabe erzeugt standardmäßig keine Punkte.

Punkte für Arbeit entstehen standardmäßig ausschließlich durch freiwillige Übernahmen.

Ein Freikauf kostet Punkte.

Ein Freikauf erhöht den aktuellen Aufgabenwert.

Nach einem Freikauf wird die Aufgabe erneut angeboten.

Der erhöhte Wert ist gleichzeitig der potentielle Gewinn einer späteren freiwilligen Übernahme.

Nach Erledigung wird der Aufgabenwert standardmäßig wieder auf den Basiswert gesetzt.

Jede Punkteänderung ist über ein Ledger nachvollziehbar.

Jede Zuweisung und jeder Freikauf ist historisch nachvollziehbar.
```

---

# 45. Erwartetes Ergebnis von Claude Code

Nicht nur einen Prototyp oder Mockup erstellen.

Liefere eine tatsächlich ausführbare Anwendung inklusive:

* Source Code
* Datenbankschema
* Migrationen
* Backend
* Frontend
* Tests
* Docker Setup
* Seed-Daten
* README
* Konfigurationsdokumentation
* kurze Architekturdokumentation

Führe am Ende selbstständig:

* Build
* Unit Tests
* Integrationstests
* relevante E2E-Tests
* statische Analyse

aus und behebe auftretende Fehler.

Beende die Arbeit nicht mit offenen TODOs für Kernfunktionalität.

Ein Punkt, den ich in der Spezifikation bewusst ergänzt habe, ist die Trennung zwischen **TaskDefinition** und **TaskInstance**. Für wiederkehrende Haushaltsaufgaben verhindert das später viele Probleme bei Historie, Werten und Wiederholungsregeln.

---

## Citadel Harness

This project is configured with the Citadel harness. Configuration lives in
`.claude/harness.json`; hooks are resolved into `.claude/settings.json`.

- Entry point for any task: `/do [anything]` — the router picks the cheapest capable path.
- `/do status` for harness state, `/do next` for the operator console, `/do --list` to browse skills.
- Persistent campaign and intake state lives under `.planning/`.

**Stack config is provisional.** No manifest existed at setup time, so `harness.json`
assumes TypeScript + React + npm with `vitest`, matching the stack proposed in section 30
above. Once the project is scaffolded, re-run `/do setup` so detection reads the real
`package.json` and `tsconfig.json`.
