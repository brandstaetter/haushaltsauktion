/**
 * Meldet die Demo-Personen einmal je Lauf an und legt ihre Sitzung ab.
 *
 * Der Anmelde-Endpunkt lässt fünf Versuche je fünf Minuten zu (§36). Würde
 * jeder Test sich selbst anmelden, liefe die Suite gegen ihre eigene
 * Schutzmaßnahme — die Antwort darauf ist, die Begrenzung zu respektieren und
 * die Sitzung wiederzuverwenden, nicht sie für Tests abzuschalten.
 *
 * Die Anmeldung selbst läuft dabei über die echte Oberfläche, nicht über einen
 * API-Aufruf: der Weg Formular → `/api/auth/login` → Cookie ist genau das, was
 * §42 als „Login funktioniert“ verlangt.
 */

import { test as setup } from '@playwright/test';

import { DEMO_USERS, loginAsDemoUser, storageStatePath, type DemoUserKey } from './helpers';

// Alle vier: die Freikauf-/Zufallszuweisungs-Tests wissen vorher nicht, wen
// die Gewichtung trifft, und der Wettlauf-Test braucht zwei unabhängige
// Sitzungen gleichzeitig (§35 „Parallelzugriff“).
const USERS: DemoUserKey[] = ['elke', 'arthur', 'luise', 'hannes'];

for (const key of USERS) {
  setup(`Sitzung für ${DEMO_USERS[key].name} anlegen`, async ({ page }) => {
    await loginAsDemoUser(page, key);
    await page.context().storageState({ path: storageStatePath(key) });
  });
}
