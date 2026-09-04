/**
 * Project-specific ESLint rules (Architektur §7.4).
 *
 * Two of the architecture's guarantees are *static* properties of the source,
 * so they are checked statically rather than trusted to review:
 *
 *   - `lock-order`   — deadlock freedom (§4.2). Buyout and completion are
 *                      deadlock-free only because both acquire 1 → 2 → 3. That
 *                      is a property a reviewer can miss and a linter cannot.
 *   - `household-scope` — the mechanical half of §36. A household-scoped query
 *                      whose `where` omits `householdId` is how cross-household
 *                      access gets in.
 */

/** §4.2's lock ladder. A call may never take a level below one already held. */
const LOCK_LEVELS = {
  acquireSweepLock: 0,
  lockInstance: 1,
  lockAssignment: 2,
  lockActiveAssignmentOfInstance: 2,
  lockActiveAssignmentsOfInstance: 2,
  lockMember: 3,
  // Integrationen (Todoist) liegen VOLLSTÄNDIG ÜBER der Aufgaben-Leiter: kein
  // Integrationspfad nimmt je ein Lock auf Level 0-3, und keine
  // Kerntransaktion wartet je auf eine Integrationszeile. Sie erweitern damit
  // die bestehende Gesamtordnung, statt eine parallele zu bilden.
  lockIntegration: 10,
  lockOutboxBatch: 11,
};

const lockOrder = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Locks must be acquired in ascending level order (Architektur §4.2): ' +
        'advisory sweep → instance → assignment → member.',
    },
    schema: [],
    messages: {
      outOfOrder:
        '{{callee}} (Ebene {{level}}) darf nicht nach einem Lock der Ebene {{held}} ' +
        'aufgerufen werden. Architektur §4.2 verlangt aufsteigende Reihenfolge — ' +
        'sonst ist die Deadlock-Freiheit von Freikauf und Erledigung nicht mehr gegeben.',
    },
  },

  create(context) {
    // A stack of the highest lock level held so far. A nested function inherits
    // its parent's level, because a callback inside `withTransaction` runs in
    // the same transaction as the code around it.
    const stack = [-1];

    function enter() {
      stack.push(stack[stack.length - 1]);
    }
    function exit() {
      stack.pop();
    }

    return {
      FunctionDeclaration: enter,
      'FunctionDeclaration:exit': exit,
      FunctionExpression: enter,
      'FunctionExpression:exit': exit,
      ArrowFunctionExpression: enter,
      'ArrowFunctionExpression:exit': exit,

      CallExpression(node) {
        const callee = node.callee;
        const name =
          callee.type === 'Identifier'
            ? callee.name
            : callee.type === 'MemberExpression' && callee.property.type === 'Identifier'
              ? callee.property.name
              : null;
        if (name === null) return;

        const level = LOCK_LEVELS[name];
        if (level === undefined) return;

        const held = stack[stack.length - 1];
        if (held > level) {
          context.report({
            node,
            messageId: 'outOfOrder',
            data: { callee: name, level: String(level), held: String(held) },
          });
          return;
        }
        stack[stack.length - 1] = Math.max(held, level);
      },
    };
  },
};

/**
 * Models that carry `householdId` (Architektur §1.2). `User`, `Session` and
 * `Household` itself are deliberately absent: the first two live on the
 * identity plane and the third *is* the scope.
 */
const SCOPED_MODELS = new Set([
  'householdMember',
  'memberAbsence',
  'taskCategory',
  'memberCategoryExclusion',
  'householdConfiguration',
  'taskDefinition',
  'taskDefinitionEligibility',
  'taskInstance',
  'taskAssignment',
  'pointTransaction',
  'taskHistoryEvent',
  'notification',
  'auditEvent',
  // Integrationen (Todoist). Ohne diese Einträge deckt die Regel die neuen
  // Tabellen stillschweigend NICHT ab — und §36 bekäme ein Loch genau dort, wo
  // die Zugangsdaten liegen.
  'memberIntegration',
  'integrationOutbox',
  'integrationTaskLink',
  // Punkte-Shop (intake "points-shop-real-life-rewards").
  'rewardDefinition',
  'rewardRedemption',
]);

const SCOPED_METHODS =
  /^(findFirst|findMany|findUnique|findUniqueOrThrow|findFirstOrThrow|update|updateMany|delete|deleteMany|upsert|count|aggregate|groupBy)$/;

/**
 * Columns with a database-wide unique index. A lookup by one of these cannot
 * cross households by accident — the value itself identifies exactly one row in
 * the whole table — so they are the one accepted alternative to a `householdId`
 * predicate.
 */
const GLOBALLY_UNIQUE_KEYS = new Set(['idempotencyKey', 'tokenHash', 'activeForInstanceId']);

/**
 * `userId` is the *other* legitimate scope on `householdMember`.
 *
 * §26 makes a person a member of several households, so login and the household
 * switcher must query memberships across households — but only ever the
 * authenticated user's own. Filtering by `userId` restricts the result to rows
 * that belong to the caller just as firmly as `householdId` restricts it to the
 * active household, so it is accepted on that model and no other.
 */
const USER_SCOPED_MODELS = new Set(['householdMember']);

const householdScope = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Every query on a household-scoped model must filter by householdId ' +
        '(Architektur §3.2, §7.4; CLAUDE.md §36).',
    },
    schema: [],
    messages: {
      missingScope:
        '`{{model}}.{{method}}` ohne householdId im where. Architektur §3.2 verlangt ' +
        'householdId als erstes Prädikat jeder Abfrage auf einem haushaltsbezogenen ' +
        'Modell — das ist der mechanische Teil von §36.',
    },
  },

  create(context) {
    function whereHasScope(whereNode, model) {
      if (whereNode.type !== 'ObjectExpression') return true; // spread or variable: not decidable
      let sawSpread = false;
      for (const prop of whereNode.properties) {
        if (prop.type === 'SpreadElement') {
          sawSpread = true;
          continue;
        }
        const key =
          prop.key.type === 'Identifier'
            ? prop.key.name
            : prop.key.type === 'Literal'
              ? String(prop.key.value)
              : null;
        if (key === null) continue;
        // `householdId`, or a compound unique like `householdId_version`.
        if (key === 'householdId' || key.startsWith('householdId_')) return true;
        if (GLOBALLY_UNIQUE_KEYS.has(key)) return true;
        if (key === 'userId' && USER_SCOPED_MODELS.has(model)) return true;
      }
      return sawSpread;
    }

    return {
      CallExpression(node) {
        const callee = node.callee;
        if (callee.type !== 'MemberExpression') return;
        if (callee.property.type !== 'Identifier') return;
        const method = callee.property.name;
        if (!SCOPED_METHODS.test(method)) return;

        const modelNode = callee.object;
        if (modelNode.type !== 'MemberExpression') return;
        if (modelNode.property.type !== 'Identifier') return;
        const model = modelNode.property.name;
        if (!SCOPED_MODELS.has(model)) return;

        const arg = node.arguments[0];
        if (arg === undefined || arg.type !== 'ObjectExpression') return;

        const whereProp = arg.properties.find(
          (p) =>
            p.type === 'Property' &&
            p.key.type === 'Identifier' &&
            p.key.name === 'where',
        );
        if (whereProp === undefined) {
          context.report({ node, messageId: 'missingScope', data: { model, method } });
          return;
        }
        if (!whereHasScope(whereProp.value, model)) {
          context.report({ node, messageId: 'missingScope', data: { model, method } });
        }
      },
    };
  },
};

export default {
  rules: {
    'lock-order': lockOrder,
    'household-scope': householdScope,
  },
};
