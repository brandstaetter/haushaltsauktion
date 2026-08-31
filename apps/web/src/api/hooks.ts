import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AvailableTaskDto,
  BuyoutQuoteDto,
  BuyoutRequest,
  BuyoutResultDto,
  CompleteRequest,
  MemberDto,
  MemberRole,
  PointTransactionDto,
  SelectionExplanationDto,
  TaskInstanceDetailDto,
  VolunteerRequest,
} from '@haushaltsauktion/shared';
import { api, setCsrfToken } from './client';
import type {
  AdminConfigDto,
  AdminMemberDto,
  AdminTaskDefinitionDto,
  CategoryDto,
  CategoryWriteBody,
  DashboardDto,
  HistoryEventRow,
  NotificationRow,
  PublicConfigDto,
  RejectCompletionOutcome,
  RejectCompletionResultDto,
  SessionDto,
  TaskDefinitionSummaryDto,
  TaskDefinitionWriteBody,
} from './types';

const sessionQueryKey = ['session'] as const;
const dashboardQueryKey = ['dashboard'] as const;
const publicConfigQueryKey = ['config', 'public'] as const;
const adminConfigQueryKey = ['admin', 'config'] as const;
const adminMembersQueryKey = ['admin', 'members'] as const;
const adminCategoriesQueryKey = ['admin', 'categories'] as const;
const adminTaskDefinitionsQueryKey = ['admin', 'task-definitions'] as const;

export function useSession() {
  return useQuery({
    queryKey: sessionQueryKey,
    queryFn: async (): Promise<SessionDto> => {
      try {
        const data = (await api('/auth/me')) as SessionDto;
        if (data.csrfToken) setCsrfToken(data.csrfToken);
        return data;
      } catch (err) {
        const apiErr = err as { status?: number };
        if (apiErr.status === 401) {
          return { user: null, member: null, household: null, role: null, csrfToken: null };
        }
        throw err;
      }
    },
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { email: string; password: string }) => {
      const data = (await api('/auth/login', { method: 'POST', body })) as SessionDto;
      if (data.csrfToken) setCsrfToken(data.csrfToken);
      return data;
    },
    onSuccess: (data: SessionDto) => {
      qc.setQueryData(sessionQueryKey, data);
      void qc.invalidateQueries({ queryKey: dashboardQueryKey });
    },
  });
}

export function useRegisterHousehold() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: {
      setupToken: string;
      householdName: string;
      adminEmail: string;
      adminDisplayName: string;
      adminPassword: string;
    }) => {
      const data = (await api('/register', { method: 'POST', body })) as SessionDto;
      if (data.csrfToken) setCsrfToken(data.csrfToken);
      return data;
    },
    onSuccess: (data: SessionDto) => {
      qc.setQueryData(sessionQueryKey, data);
      void qc.invalidateQueries({ queryKey: dashboardQueryKey });
    },
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api('/auth/logout', { method: 'POST' }),
    onSuccess: () => {
      setCsrfToken(null);
      qc.setQueryData(sessionQueryKey, {
        user: null,
        member: null,
        household: null,
        role: null,
        csrfToken: null,
      });
      void qc.clear();
    },
  });
}

export function useDashboard() {
  return useQuery({
    queryKey: dashboardQueryKey,
    queryFn: () => api<DashboardDto>('/dashboard'),
    refetchInterval: 30_000,
  });
}

export function usePublicConfig() {
  return useQuery({
    queryKey: publicConfigQueryKey,
    queryFn: () => api<PublicConfigDto>('/config/public'),
    staleTime: 60_000,
  });
}

export function useAvailableTasks() {
  return useQuery({
    queryKey: ['tasks', 'available'],
    queryFn: () => api<{ items: AvailableTaskDto[] }>('/tasks/available'),
  });
}

export function useAssignedTasks() {
  return useQuery({
    queryKey: ['tasks', 'assigned-to-me'],
    queryFn: () => api<{ items: AvailableTaskDto[] }>('/tasks/assigned-to-me'),
  });
}

export function useTaskDetail(instanceId: string | undefined) {
  return useQuery({
    queryKey: ['tasks', instanceId],
    queryFn: () =>
      instanceId ? api<TaskInstanceDetailDto>(`/tasks/${instanceId}`) : Promise.reject('no id'),
    enabled: Boolean(instanceId),
  });
}

export function useTaskHistory(instanceId: string | undefined, cursor?: string | null) {
  return useQuery({
    queryKey: ['tasks', instanceId, 'history', cursor],
    queryFn: () =>
      instanceId
        ? api<{ items: HistoryEventRow[]; nextCursor: string | null }>(
            `/tasks/${instanceId}/history?limit=25${cursor ? `&cursor=${cursor}` : ''}`,
          )
        : Promise.reject('no id'),
    enabled: Boolean(instanceId),
  });
}

export function useAssignmentQuote(assignmentId: string | undefined) {
  return useQuery({
    queryKey: ['assignments', assignmentId, 'quote'],
    queryFn: () =>
      assignmentId
        ? api<BuyoutQuoteDto>(`/assignments/${assignmentId}/buyout-quote`)
        : Promise.reject('no assignment'),
    enabled: Boolean(assignmentId),
    refetchInterval: 30_000,
  });
}

export function useAssignmentExplanation(assignmentId: string | undefined) {
  return useQuery({
    queryKey: ['assignments', assignmentId, 'explain'],
    queryFn: () =>
      assignmentId
        ? api<SelectionExplanationDto>(`/assignments/${assignmentId}/explain`)
        : Promise.reject('no assignment'),
    enabled: Boolean(assignmentId),
  });
}

export function useHistory(filters: {
  taskInstanceId?: string;
  memberId?: string;
  cursor?: string | null;
}) {
  const params = new URLSearchParams();
  params.set('limit', '25');
  if (filters.taskInstanceId) params.set('taskInstanceId', filters.taskInstanceId);
  if (filters.memberId) params.set('memberId', filters.memberId);
  if (filters.cursor) params.set('cursor', filters.cursor);
  return useQuery({
    queryKey: ['history', filters],
    queryFn: () =>
      api<{ items: HistoryEventRow[]; nextCursor: string | null }>(`/history?${params.toString()}`),
  });
}

export function useMemberMe() {
  return useQuery({
    queryKey: ['members', 'me'],
    queryFn: () => api<MemberDto>('/members/me'),
  });
}

export function usePointTransactions(cursor?: string | null) {
  return useQuery({
    queryKey: ['members', 'me', 'transactions', cursor],
    queryFn: () =>
      api<{ items: PointTransactionDto[]; nextCursor: string | null }>(
        `/members/me/point-transactions?limit=25${cursor ? `&cursor=${cursor}` : ''}`,
      ),
  });
}

export function useMembers() {
  return useQuery({
    queryKey: ['members'],
    queryFn: () => api<{ items: MemberDto[] }>('/members'),
  });
}

export function useVolunteer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: VolunteerRequest }) =>
      api<{ instance: TaskInstanceDetailDto }>(`/tasks/${id}/volunteer`, {
        method: 'POST',
        body,
      }),
    onSuccess: (_: unknown, vars: { id: string; body: VolunteerRequest }) => {
      qc.setQueryData(['tasks', vars.id], (old: TaskInstanceDetailDto | undefined) =>
        old ? { ...old } : old,
      );
      void qc.invalidateQueries({ queryKey: dashboardQueryKey });
      void qc.invalidateQueries({ queryKey: ['tasks'] });
      void qc.invalidateQueries({ queryKey: ['history'] });
    },
  });
}

export function useCompleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: CompleteRequest }) =>
      api(`/tasks/${id}/complete`, { method: 'POST', body }),
    onSuccess: (_: unknown, vars: { id: string; body: CompleteRequest }) => {
      qc.setQueryData(['tasks', vars.id], (old: TaskInstanceDetailDto | undefined) =>
        old ? { ...old } : old,
      );
      void qc.invalidateQueries({ queryKey: dashboardQueryKey });
      void qc.invalidateQueries({ queryKey: ['tasks'] });
      void qc.invalidateQueries({ queryKey: ['members', 'me'] });
      void qc.invalidateQueries({ queryKey: ['history'] });
    },
  });
}

export function useBuyout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ assignmentId, body }: { assignmentId: string; body: BuyoutRequest }) =>
      api<BuyoutResultDto>(`/assignments/${assignmentId}/buyout`, { method: 'POST', body }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: dashboardQueryKey });
      void qc.invalidateQueries({ queryKey: ['tasks'] });
      void qc.invalidateQueries({ queryKey: ['members', 'me'] });
      void qc.invalidateQueries({ queryKey: ['history'] });
    },
  });
}

export function useAcceptAssignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (assignmentId: string) =>
      api(`/assignments/${assignmentId}/accept`, { method: 'POST' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: dashboardQueryKey });
      void qc.invalidateQueries({ queryKey: ['tasks'] });
      void qc.invalidateQueries({ queryKey: ['history'] });
    },
  });
}

export function useReleaseAssignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ instanceId, assignmentId }: { instanceId: string; assignmentId: string }) =>
      api(`/tasks/${instanceId}/release`, { method: 'POST', body: { assignmentId } }),
    onSuccess: (
      _: unknown,
      vars: { instanceId: string; assignmentId: string },
    ) => {
      qc.setQueryData(['tasks', vars.instanceId], (old: TaskInstanceDetailDto | undefined) =>
        old ? { ...old } : old,
      );
      void qc.invalidateQueries({ queryKey: dashboardQueryKey });
      void qc.invalidateQueries({ queryKey: ['tasks'] });
      void qc.invalidateQueries({ queryKey: ['history'] });
    },
  });
}

export function useRejectCompletion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      instanceId,
      reason,
      outcome,
    }: {
      instanceId: string;
      reason: string | null;
      outcome: RejectCompletionOutcome;
    }) =>
      api<RejectCompletionResultDto>(`/admin/instances/${instanceId}/reject-completion`, {
        method: 'POST',
        body: { reason, outcome },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: dashboardQueryKey });
      void qc.invalidateQueries({ queryKey: ['members'] });
      void qc.invalidateQueries({ queryKey: ['history'] });
      void qc.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}

export function useAdminConfig() {
  return useQuery({
    queryKey: adminConfigQueryKey,
    queryFn: () => api<AdminConfigDto>('/admin/config'),
  });
}

export function useSaveConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { expectedVersion: number; values: Record<string, unknown> }) =>
      api('/admin/config', { method: 'PUT', body }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: publicConfigQueryKey });
      void qc.invalidateQueries({ queryKey: ['tasks'] });
      void qc.invalidateQueries({ queryKey: dashboardQueryKey });
    },
  });
}

export function usePreviewConfig() {
  return useMutation({
    mutationFn: (body: { values: Record<string, unknown>; sampleBaseValue?: number }) =>
      api('/admin/config/validate', { method: 'POST', body }),
  });
}

export function useRunSweep() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ dryRun = false }: { dryRun?: boolean } = {}) =>
      api<{
        materialized: number;
        published: number;
        assigned: number;
        expired: number;
        skipped: number;
      }>('/admin/assignments/run', { method: 'POST', body: { dryRun } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: dashboardQueryKey });
      void qc.invalidateQueries({ queryKey: ['tasks'] });
      void qc.invalidateQueries({ queryKey: ['history'] });
    },
  });
}

// ───────────────────────── admin: members ─────────────────────────

export function useAdminMembers() {
  return useQuery({
    queryKey: adminMembersQueryKey,
    queryFn: () => api<{ items: AdminMemberDto[] }>('/admin/members'),
  });
}

/**
 * Full category list — already the complete shape a future category-CRUD
 * panel (Phase 4) would need too, so it's named/keyed for that reuse rather
 * than as a members-only helper.
 */
export function useAdminCategories() {
  return useQuery({
    queryKey: adminCategoriesQueryKey,
    queryFn: () => api<{ items: CategoryDto[] }>('/admin/categories'),
  });
}

/**
 * Full task-definition list (active only unless `includeArchived`), sourced
 * from `GET /admin/task-definitions`. The active-only call shares its query
 * key (`['admin', 'task-definitions']`) with `useTaskDefinitionLabels()`
 * below — same endpoint, same cache entry, no double-fetch. The
 * `includeArchived` variant gets its own key (`[...key, 'archived']`) so
 * flipping the admin panel's "archivierte anzeigen" toggle can't clobber the
 * active-only list other consumers (e.g. the members' restriction pickers)
 * rely on.
 */
export function useAdminTaskDefinitions(includeArchived = false) {
  return useQuery({
    queryKey: includeArchived
      ? [...adminTaskDefinitionsQueryKey, 'archived']
      : adminTaskDefinitionsQueryKey,
    queryFn: () =>
      api<{ items: AdminTaskDefinitionDto[] }>(
        includeArchived ? '/admin/task-definitions?includeArchived=true' : '/admin/task-definitions',
      ),
  });
}

/**
 * Task-definition titles only, for the restrictions picker's label lookup.
 * Delegates to `useAdminTaskDefinitions()` so both hooks read/write the same
 * cache entry instead of double-fetching; `AdminTaskDefinitionDto` (full row)
 * is structurally assignable to `TaskDefinitionSummaryDto` (`id`/`title`
 * only), so no mapping is needed.
 */
export function useTaskDefinitionLabels(): {
  data: { items: TaskDefinitionSummaryDto[] } | undefined;
  isLoading: boolean;
} {
  return useAdminTaskDefinitions();
}

export function useCreateTaskDefinition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: TaskDefinitionWriteBody) =>
      api<AdminTaskDefinitionDto>('/admin/task-definitions', { method: 'POST', body }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: adminTaskDefinitionsQueryKey }),
  });
}

export function useUpdateTaskDefinition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: TaskDefinitionWriteBody }) =>
      api<{ id: string }>(`/admin/task-definitions/${id}`, { method: 'PUT', body }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: adminTaskDefinitionsQueryKey }),
  });
}

export function useArchiveTaskDefinition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/admin/task-definitions/${id}`, { method: 'DELETE' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: adminTaskDefinitionsQueryKey }),
  });
}

export function useUpdateTaskEligibility() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: string;
      body: { included: string[]; excluded: string[] };
    }) => api<{ id: string }>(`/admin/task-definitions/${id}/eligibility`, { method: 'PUT', body }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: adminTaskDefinitionsQueryKey }),
  });
}

/** The `MANUAL` recurrence path of §18 — an admin materializes the next instance on demand. */
export function useMaterializeTaskDefinition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api<{ instance: TaskInstanceDetailDto }>(`/admin/task-definitions/${id}/materialize`, {
        method: 'POST',
        body: {},
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: dashboardQueryKey });
      void qc.invalidateQueries({ queryKey: ['tasks'] });
      void qc.invalidateQueries({ queryKey: ['history'] });
    },
  });
}

export function useCreateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CategoryWriteBody) =>
      api<CategoryDto>('/admin/categories', { method: 'POST', body }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: adminCategoriesQueryKey });
      void qc.invalidateQueries({ queryKey: adminTaskDefinitionsQueryKey });
    },
  });
}

export function useUpdateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: CategoryWriteBody }) =>
      api<{ id: string }>(`/admin/categories/${id}`, { method: 'PUT', body }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: adminCategoriesQueryKey });
      void qc.invalidateQueries({ queryKey: adminTaskDefinitionsQueryKey });
    },
  });
}

export function useDeleteCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/admin/categories/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: adminCategoriesQueryKey });
      void qc.invalidateQueries({ queryKey: adminTaskDefinitionsQueryKey });
    },
  });
}

export function useCreateMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      email: string;
      displayName: string;
      password?: string;
      role?: MemberRole;
    }) =>
      api<{ id: string; temporaryPassword: string | null }>('/admin/members', {
        method: 'POST',
        body,
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: adminMembersQueryKey }),
  });
}

export function useResetMemberPassword() {
  return useMutation({
    mutationFn: ({ id, password }: { id: string; password?: string }) =>
      api<{ id: string; temporaryPassword: string }>(`/admin/members/${id}/reset-password`, {
        method: 'POST',
        body: password === undefined ? {} : { password },
      }),
  });
}

export function useUpdateMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: string;
      body: Partial<{
        displayName: string;
        avatarUrl: string | null;
        isActive: boolean;
        role: MemberRole;
        maxRandomAssignmentsPerWeek: number | null;
      }>;
    }) => api<{ id: string }>(`/admin/members/${id}`, { method: 'PATCH', body }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: adminMembersQueryKey }),
  });
}

export function useUpdateMemberRestrictions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: string;
      body: {
        excludedCategoryIds: string[];
        excludedTaskDefinitionIds: string[];
        absences: { startsAt: string; endsAt: string; reason: string | null }[];
      };
    }) => api<{ id: string }>(`/admin/members/${id}/restrictions`, { method: 'PUT', body }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: adminMembersQueryKey }),
  });
}

const notificationsQueryKey = ['notifications'] as const;

/**
 * §24 — in-app notifications. No websocket/push infra exists (nor is one
 * needed at household scale, §43), so a short poll is the whole mechanism:
 * cheap, and correct enough that a new notification shows up within half a
 * minute of being written by the sweep, completion, or buyout use-cases.
 */
export function useNotifications() {
  return useQuery({
    queryKey: notificationsQueryKey,
    queryFn: () =>
      api<{ items: NotificationRow[]; unreadCount: number; nextCursor: string | null }>(
        '/notifications?limit=30',
      ),
    refetchInterval: 30_000,
  });
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/notifications/${id}/read`, { method: 'POST' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: notificationsQueryKey }),
  });
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api('/notifications/read-all', { method: 'POST' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: notificationsQueryKey }),
  });
}
