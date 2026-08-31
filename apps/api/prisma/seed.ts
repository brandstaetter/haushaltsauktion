/**
 * Demo-Daten (CLAUDE.md §38) — `npm run seed`.
 *
 * Household "Demo Family", die vier Mitglieder Elke, Arthur, Luise und Hannes und
 * die sechs Aufgaben mit ihren Basiswerten 2 / 2 / 4 / 4 / 6 / 7.
 *
 * Vollständig idempotent: alle Datensätze tragen feste ids und werden per
 * upsert geschrieben, offene Instanzen werden nur angelegt, wenn die
 * Obergrenze aus `tasks.maxOpenInstancesPerDefinition` (§5.3) es zulässt. Ein
 * zweiter Lauf ändert deshalb nichts und erzeugt keine Duplikate.
 *
 * Das Ledger bleibt bewusst leer: jeder Punktestand entsteht ausschließlich
 * durch echte Buchungen über postTransaction (§8.2, §14). Ein Startguthaben
 * hier einzutragen würde genau die Abkürzung nehmen, die §14 verbietet.
 */

import { hash } from '@node-rs/argon2';
import { PrismaClient, Prisma } from '@prisma/client';

import { DEFAULT_CONFIG, parseConfig } from '@haushaltsauktion/shared';

import { dueAtFor, nextOccurrence, type RecurrenceRule } from '../src/domain/recurrence/next-occurrence.js';

const prisma = new PrismaClient();

const HOUSEHOLD_ID = 'seed-household-demo-family';
const TIMEZONE = 'Europe/Berlin';

/** Dokumentiert im README. Nur für die lokale Demo. */
const DEMO_PASSWORD = 'demo1234';

interface SeedMember {
  key: string;
  displayName: string;
  email: string;
  role: 'ADMIN' | 'MEMBER';
}

/** §38 — Elke, Arthur, Luise, Hannes. */
const MEMBERS: SeedMember[] = [
  { key: 'elke', displayName: 'Elke', email: 'elke@demo.local', role: 'ADMIN' },
  { key: 'arthur', displayName: 'Arthur', email: 'arthur@demo.local', role: 'MEMBER' },
  { key: 'luise', displayName: 'Luise', email: 'luise@demo.local', role: 'MEMBER' },
  { key: 'hannes', displayName: 'Hannes', email: 'hannes@demo.local', role: 'MEMBER' },
];

const CATEGORIES = [
  { key: 'kueche', name: 'Küche', colorHex: '#E8A33D', sortOrder: 1 },
  { key: 'bad', name: 'Bad', colorHex: '#4B9CD3', sortOrder: 2 },
  { key: 'wohnen', name: 'Wohnbereich', colorHex: '#7BAE7F', sortOrder: 3 },
  { key: 'waesche', name: 'Wäsche & Müll', colorHex: '#B08BBB', sortOrder: 4 },
];

interface SeedTask {
  key: string;
  title: string;
  description: string;
  categoryKey: string;
  /** §38 — die Basiswerte sind normativ. */
  baseValue: number;
  estimatedMinutes: number;
  recurrence: RecurrenceRule;
}

/** §38 mit den Wiederholungsregeln aus §18. */
const TASKS: SeedTask[] = [
  {
    key: 'geschirrspueler',
    title: 'Geschirrspüler ausräumen',
    description: 'Sauberes Geschirr einräumen, Maschine für den Tag frei machen.',
    categoryKey: 'kueche',
    baseValue: 2,
    estimatedMinutes: 5,
    recurrence: {
      type: 'DAILY',
      interval: null,
      weekdays: [],
      dayOfMonth: null,
      timeOfDay: '07:00',
      dueOffsetMinutes: 13 * 60,
    },
  },
  {
    key: 'muell',
    title: 'Müll hinausbringen',
    description: 'Restmüll, Bio und Papier an die Straße stellen.',
    categoryKey: 'waesche',
    baseValue: 2,
    estimatedMinutes: 5,
    // §18: "Müll: Montag und Donnerstag"
    recurrence: {
      type: 'WEEKDAYS',
      interval: null,
      weekdays: [1, 4],
      dayOfMonth: null,
      timeOfDay: '18:00',
      dueOffsetMinutes: 4 * 60,
    },
  },
  {
    key: 'waesche-aufhaengen',
    title: 'Wäsche aufhängen',
    description: 'Waschmaschine ausräumen und Wäsche aufhängen.',
    categoryKey: 'waesche',
    baseValue: 4,
    estimatedMinutes: 15,
    recurrence: {
      type: 'EVERY_N_DAYS',
      interval: 2,
      weekdays: [],
      dayOfMonth: null,
      timeOfDay: '17:00',
      dueOffsetMinutes: 6 * 60,
    },
  },
  {
    key: 'staubsaugen',
    title: 'Staubsaugen',
    description: 'Wohnzimmer, Flur und Schlafzimmer saugen.',
    categoryKey: 'wohnen',
    baseValue: 4,
    estimatedMinutes: 25,
    recurrence: {
      type: 'WEEKLY',
      interval: null,
      weekdays: [6],
      dayOfMonth: null,
      timeOfDay: '10:00',
      dueOffsetMinutes: 12 * 60,
    },
  },
  {
    key: 'bad-putzen',
    title: 'Bad putzen',
    description: 'Waschbecken, Dusche, WC und Spiegel reinigen.',
    categoryKey: 'bad',
    baseValue: 6,
    estimatedMinutes: 30,
    // §18: "Bad putzen: jede Woche"
    recurrence: {
      type: 'WEEKLY',
      interval: null,
      weekdays: [6],
      dayOfMonth: null,
      timeOfDay: '10:00',
      dueOffsetMinutes: 12 * 60,
    },
  },
  {
    key: 'kueche-reinigen',
    title: 'Küche gründlich reinigen',
    description: 'Arbeitsflächen, Herd, Backofen und Kühlschrank.',
    categoryKey: 'kueche',
    baseValue: 7,
    estimatedMinutes: 45,
    recurrence: {
      type: 'MONTHLY',
      interval: null,
      weekdays: [],
      dayOfMonth: 1,
      timeOfDay: '10:00',
      dueOffsetMinutes: 12 * 60,
    },
  },
];

const OPEN_STATUSES = ['DRAFT', 'AVAILABLE', 'ASSIGNED', 'PAUSED'] as const;

const memberId = (key: string): string => `seed-member-${key}`;
const userId = (key: string): string => `seed-user-${key}`;
const categoryId = (key: string): string => `seed-category-${key}`;
const definitionId = (key: string): string => `seed-task-${key}`;

async function main(): Promise<void> {
  const now = new Date();

  // Die Konfiguration wird durch dasselbe Schema geprüft, das auch
  // `PUT /admin/config` verwendet — die Defaults sind damit nachweislich gültig.
  const config = parseConfig(DEFAULT_CONFIG);

  const household = await prisma.household.upsert({
    where: { id: HOUSEHOLD_ID },
    update: { name: 'Demo Family', timezone: TIMEZONE },
    create: { id: HOUSEHOLD_ID, name: 'Demo Family', timezone: TIMEZONE },
  });

  // §5.2 — Version 1 wird vom Seed aus DEFAULT_CONFIG geschrieben.
  await prisma.householdConfiguration.upsert({
    where: { householdId_version: { householdId: household.id, version: 1 } },
    update: {},
    create: {
      id: 'seed-config-v1',
      householdId: household.id,
      version: 1,
      values: config as unknown as Prisma.InputJsonObject,
    },
  });

  const passwordHash = await hash(DEMO_PASSWORD, { algorithm: 2 /* argon2id */ });

  for (const member of MEMBERS) {
    await prisma.user.upsert({
      where: { email: member.email },
      update: { displayName: member.displayName, isActive: true },
      create: {
        id: userId(member.key),
        email: member.email,
        displayName: member.displayName,
        passwordHash,
      },
    });

    await prisma.householdMember.upsert({
      where: {
        householdId_userId: { householdId: household.id, userId: userId(member.key) },
      },
      update: { displayName: member.displayName, role: member.role, isActive: true },
      create: {
        id: memberId(member.key),
        householdId: household.id,
        userId: userId(member.key),
        displayName: member.displayName,
        role: member.role,
        // pointsCache bleibt 0 — Punkte entstehen nur über das Ledger (§14).
      },
    });
  }

  for (const category of CATEGORIES) {
    await prisma.taskCategory.upsert({
      where: { householdId_name: { householdId: household.id, name: category.name } },
      update: { colorHex: category.colorHex, sortOrder: category.sortOrder },
      create: {
        id: categoryId(category.key),
        householdId: household.id,
        name: category.name,
        colorHex: category.colorHex,
        sortOrder: category.sortOrder,
      },
    });
  }

  for (const task of TASKS) {
    const scheduledFor = nextOccurrence(task.recurrence, now, TIMEZONE) ?? now;

    await prisma.taskDefinition.upsert({
      where: { id: definitionId(task.key) },
      update: {
        title: task.title,
        description: task.description,
        categoryId: categoryId(task.categoryKey),
        baseValue: task.baseValue,
        estimatedMinutes: task.estimatedMinutes,
        isActive: true,
      },
      create: {
        id: definitionId(task.key),
        householdId: household.id,
        title: task.title,
        description: task.description,
        categoryId: categoryId(task.categoryKey),
        baseValue: task.baseValue,
        estimatedMinutes: task.estimatedMinutes,
        recurrenceType: task.recurrence.type,
        recurrenceInterval: task.recurrence.interval,
        recurrenceWeekdays: [...task.recurrence.weekdays],
        recurrenceDayOfMonth: task.recurrence.dayOfMonth,
        recurrenceTimeOfDay: task.recurrence.timeOfDay,
        dueOffsetMinutes: task.recurrence.dueOffsetMinutes,
        nextDueAt: scheduledFor,
      },
    });
  }

  // Je Definition eine offene, angebotene Instanz — damit die Demo sofort etwas
  // zu tun hat (§19, §20). Respektiert die Obergrenze aus §5.3, wodurch ein
  // zweiter Seed-Lauf keine zweite Karte für dieselbe Aufgabe erzeugt.
  let publishedInstances = 0;

  for (const task of TASKS) {
    const openCount = await prisma.taskInstance.count({
      where: {
        householdId: household.id,
        taskDefinitionId: definitionId(task.key),
        status: { in: [...OPEN_STATUSES] },
      },
    });
    if (openCount >= config.tasks.maxOpenInstancesPerDefinition) continue;

    const scheduledFor = nextOccurrence(task.recurrence, now, TIMEZONE) ?? now;
    const dueAt = dueAtFor(task.recurrence, scheduledFor);

    const instance = await prisma.taskInstance.create({
      data: {
        householdId: household.id,
        taskDefinitionId: definitionId(task.key),
        status: 'AVAILABLE',
        // §1.4 — baseValue wird auf die Instanz kopiert, currentValue startet
        // bei carriedValue ?? baseValue (T1). Ohne Übertrag: der Basiswert.
        currentValue: task.baseValue,
        baseValue: task.baseValue,
        scheduledFor,
        dueAt,
        publishedAt: now,
        // Demo-Instanzen sind sofort reif für die Zufallszuweisung, damit der
        // Sweep direkt ausprobiert werden kann.
        offerExpiresAt: now,
        configVersion: 1,
      },
    });

    // §2.6 — strukturierte Ereignisse, kein Fließtext. Die deutsche Formulierung
    // entsteht erst im Web-Client.
    await prisma.taskHistoryEvent.createMany({
      data: [
        {
          householdId: household.id,
          taskInstanceId: instance.id,
          type: 'CREATED',
          payload: { title: task.title, value: task.baseValue },
        },
        {
          householdId: household.id,
          taskInstanceId: instance.id,
          type: 'OFFERED',
          payload: { title: task.title, value: task.baseValue },
        },
      ],
    });

    publishedInstances += 1;
  }

  const counts = {
    members: await prisma.householdMember.count({ where: { householdId: household.id } }),
    categories: await prisma.taskCategory.count({ where: { householdId: household.id } }),
    definitions: await prisma.taskDefinition.count({ where: { householdId: household.id } }),
    openInstances: await prisma.taskInstance.count({
      where: { householdId: household.id, status: { in: [...OPEN_STATUSES] } },
    }),
    ledgerEntries: await prisma.pointTransaction.count({ where: { householdId: household.id } }),
  };

  console.log(`Seed abgeschlossen für "${household.name}" (${household.id})`);
  console.log(`  Mitglieder:        ${counts.members}`);
  console.log(`  Kategorien:        ${counts.categories}`);
  console.log(`  Aufgaben:          ${counts.definitions}`);
  console.log(`  offene Instanzen:  ${counts.openInstances} (${publishedInstances} neu angeboten)`);
  console.log(`  Ledger-Einträge:   ${counts.ledgerEntries}`);
  console.log(`  Login:             ${MEMBERS.map((m) => m.email).join(', ')} / ${DEMO_PASSWORD}`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error: unknown) => {
    console.error('Seed fehlgeschlagen:', error);
    await prisma.$disconnect();
    process.exit(1);
  });
