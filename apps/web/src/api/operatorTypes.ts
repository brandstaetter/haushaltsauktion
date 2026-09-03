/** Mirrors `OperatorMetrics` in apps/api/src/app/operator/metrics.ts exactly. */
export interface OperatorMetricsDto {
  households: { total: number; active: number };
  users: { total: number; active: number; activeLast24h: number; activeLast7d: number };
  taskThroughput: { completedLast24h: number; completedLast7d: number };
  ledgerVolume: {
    transactionsLast7d: number;
    byType: Record<string, { count: number; sum: number }>;
  };
  buyouts: { last7d: number };
  todoistAdoption: { activeIntegrations: number };
  auditVolume: { last7d: number };
}

/** Response shape of `POST /api/operator/login` (apps/api/.../routes/operator.ts). */
export interface OperatorSessionDto {
  operator: { id: string; email: string } | null;
  csrfToken: string | null;
}
