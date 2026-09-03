import { Link } from 'react-router';
import { useOperatorLogout, useOperatorMetrics, useOperatorSession } from '../../api/operatorHooks';
import { Button } from '../../components/Button/Button';
import styles from './OperatorDashboardPage.module.css';

/**
 * Snapshot-only stat grid (Architektur `.planning/architecture-operator-dashboard.md`,
 * Phase 4 / "no trend storage" decision) — no charts, no history, just the
 * live numbers from `GET /api/operator/metrics`.
 */
export function OperatorDashboardPage() {
  const { operator } = useOperatorSession();
  const logout = useOperatorLogout();
  const { data, isLoading, error } = useOperatorMetrics(Boolean(operator));

  if (!operator) {
    return (
      <div className={styles.loggedOut}>
        <p>Nicht angemeldet.</p>
        <Link to="/betrieb/login">Zur Anmeldung</Link>
      </div>
    );
  }

  return (
    <div className={styles.dashboard}>
      <div className={styles.header}>
        <h1 className={styles.title}>Betriebsdashboard</h1>
        <Button variant="secondary" size="sm" onClick={() => logout.mutate()} loading={logout.isPending}>
          Abmelden
        </Button>
      </div>

      {isLoading && <p>Lade Kennzahlen…</p>}
      {error && <p role="alert">Kennzahlen konnten nicht geladen werden.</p>}

      {data && (
        <div className={styles.grid}>
          <div className={styles.tile}>
            <h2 className={styles.tileTitle}>Haushalte</h2>
            <div className={styles.tileRow}>
              <span>Gesamt</span>
              <span>{data.households.total}</span>
            </div>
            <div className={styles.tileRow}>
              <span>Aktiv (14 Tage)</span>
              <span>{data.households.active}</span>
            </div>
          </div>

          <div className={styles.tile}>
            <h2 className={styles.tileTitle}>Nutzer</h2>
            <div className={styles.tileRow}>
              <span>Registriert</span>
              <span>{data.users.total}</span>
            </div>
            <div className={styles.tileRow}>
              <span>Aktiv (Konto)</span>
              <span>{data.users.active}</span>
            </div>
            <div className={styles.tileRow}>
              <span>Aktiv (24 h)</span>
              <span>{data.users.activeLast24h}</span>
            </div>
            <div className={styles.tileRow}>
              <span>Aktiv (7 Tage)</span>
              <span>{data.users.activeLast7d}</span>
            </div>
          </div>

          <div className={styles.tile}>
            <h2 className={styles.tileTitle}>Aufgaben-Durchsatz</h2>
            <div className={styles.tileRow}>
              <span>Erledigt (24 h)</span>
              <span>{data.taskThroughput.completedLast24h}</span>
            </div>
            <div className={styles.tileRow}>
              <span>Erledigt (7 Tage)</span>
              <span>{data.taskThroughput.completedLast7d}</span>
            </div>
          </div>

          <div className={styles.tile}>
            <h2 className={styles.tileTitle}>Punkte-Ledger (7 Tage)</h2>
            <div className={styles.tileRow}>
              <span>Buchungen gesamt</span>
              <span>{data.ledgerVolume.transactionsLast7d}</span>
            </div>
            {Object.entries(data.ledgerVolume.byType).map(([type, v]) => (
              <div className={styles.tileRow} key={type}>
                <span>{type}</span>
                <span>
                  {v.count} ({v.sum >= 0 ? '+' : ''}
                  {v.sum})
                </span>
              </div>
            ))}
          </div>

          <div className={styles.tile}>
            <h2 className={styles.tileTitle}>Freikäufe (7 Tage)</h2>
            <div className={styles.tileRow}>
              <span>Anzahl</span>
              <span>{data.buyouts.last7d}</span>
            </div>
          </div>

          <div className={styles.tile}>
            <h2 className={styles.tileTitle}>Todoist</h2>
            <div className={styles.tileRow}>
              <span>Aktive Verbindungen</span>
              <span>{data.todoistAdoption.activeIntegrations}</span>
            </div>
          </div>

          <div className={styles.tile}>
            <h2 className={styles.tileTitle}>Audit-Ereignisse (7 Tage)</h2>
            <div className={styles.tileRow}>
              <span>Anzahl</span>
              <span>{data.auditVolume.last7d}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
