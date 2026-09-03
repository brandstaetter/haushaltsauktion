import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { operatorApi, setOperatorCsrfToken } from './operatorClient';
import type { OperatorMetricsDto, OperatorSessionDto } from './operatorTypes';

const operatorSessionQueryKey = ['operator', 'session'] as const;
const operatorMetricsQueryKey = ['operator', 'metrics'] as const;

const emptyOperatorSession: OperatorSessionDto = { operator: null, csrfToken: null };

/**
 * No `GET /api/operator/me`-equivalent exists — the operator's logged-in
 * state is only ever what a successful login wrote into this cache. A page
 * reload logs the operator out, same as never having a persistent
 * session-restore check. Deliberately simple for v1 (architecture doc, Phase
 * 4: operator frontend).
 *
 * `enabled: false` means this never fetches over the network — it exists
 * purely so components re-render reactively when `useOperatorLogin`/
 * `useOperatorLogout` write to this query key via `setQueryData`. A plain
 * `queryClient.getQueryData()` read would not subscribe to later cache
 * writes, so logging out would not update an already-mounted component.
 */
export function useOperatorSession() {
  const { data } = useQuery({
    queryKey: operatorSessionQueryKey,
    queryFn: () => Promise.resolve(emptyOperatorSession),
    enabled: false,
    initialData: emptyOperatorSession,
    staleTime: Infinity,
  });
  return data;
}

export function useOperatorLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { email: string; password: string }) => {
      const data = await operatorApi<OperatorSessionDto>('/login', { method: 'POST', body });
      if (data.csrfToken) setOperatorCsrfToken(data.csrfToken);
      return data;
    },
    onSuccess: (data: OperatorSessionDto) => {
      qc.setQueryData(operatorSessionQueryKey, data);
    },
  });
}

export function useOperatorLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => operatorApi('/logout', { method: 'POST' }),
    onSuccess: () => {
      setOperatorCsrfToken(null);
      qc.setQueryData(operatorSessionQueryKey, { operator: null, csrfToken: null });
      void qc.removeQueries({ queryKey: operatorMetricsQueryKey });
    },
  });
}

export function useOperatorMetrics(enabled: boolean) {
  return useQuery({
    queryKey: operatorMetricsQueryKey,
    queryFn: () => operatorApi<OperatorMetricsDto>('/metrics'),
    enabled,
  });
}
