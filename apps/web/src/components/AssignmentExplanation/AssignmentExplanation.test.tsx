import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { SelectionExplanationDto } from '@haushaltsauktion/shared';
import { de } from '../../strings/de';
import { AssignmentExplanation } from './AssignmentExplanation';

vi.mock('../../api/client', () => ({
  api: vi.fn(),
  setCsrfToken: vi.fn(),
  ApiError: class ApiError extends Error {
    status: number;
    code: string;
    constructor(status: number, body?: { error?: { code?: string; message?: string } }) {
      super(body?.error?.message ?? `HTTP ${status}`);
      this.status = status;
      this.code = body?.error?.code ?? 'UNKNOWN';
      this.name = 'ApiError';
    }
  },
}));

import { api } from '../../api/client';

const mockedApi = vi.mocked(api);

function explanationFixture(
  overrides: Partial<SelectionExplanationDto> = {},
): SelectionExplanationDto {
  return {
    assignmentId: 'assignment-1',
    strategy: 'WEIGHTED_FAIRNESS',
    decidedAt: '2026-08-30T19:00:00Z',
    configVersion: 1,
    eligibleCount: 3,
    constraintsRelaxed: [],
    candidates: [
      {
        memberId: 'm-anna',
        displayName: 'Anna',
        included: false,
        exclusionReason: 'IMMEDIATE_REASSIGNMENT_BLOCKED',
        weightTerms: null,
        weight: null,
        probability: null,
        selected: false,
      },
      {
        memberId: 'm-paul',
        displayName: 'Paul',
        included: true,
        exclusionReason: null,
        weightTerms: { base: 1 },
        weight: 0.8,
        probability: 0.4,
        selected: false,
      },
      {
        memberId: 'm-maria',
        displayName: 'Maria',
        included: true,
        exclusionReason: null,
        weightTerms: { base: 1.2 },
        weight: 1.2,
        probability: 0.6,
        selected: true,
      },
    ],
    ...overrides,
  };
}

function renderExplanation(assignmentId = 'assignment-1') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AssignmentExplanation assignmentId={assignmentId} />
    </QueryClientProvider>,
  );
}

describe('AssignmentExplanation', () => {
  afterEach(() => {
    mockedApi.mockReset();
  });

  it('zeigt die Anzahl verfügbarer Personen und die Gewichte der Kandidaten', async () => {
    const user = userEvent.setup();
    mockedApi.mockResolvedValue(explanationFixture());

    renderExplanation();
    await user.click(screen.getByRole('button', { name: de.fairness.trigger }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Für diese Aufgabe waren 3 Personen verfügbar.')).toBeInTheDocument();
    expect(within(dialog).getByText(/Gewicht 1,2/)).toBeInTheDocument();
    expect(within(dialog).getByText(de.fairness.selected)).toBeInTheDocument();
    // Keine Lockerungs-Notiz, wenn constraintsRelaxed leer ist.
    expect(within(dialog).queryByText(/aufgeweicht/)).toBeNull();
  });

  it('zeigt den ausgeschlossenen Kandidaten mit deutschem Ausschlussgrund, nicht dem rohen Enum-Wert', async () => {
    const user = userEvent.setup();
    mockedApi.mockResolvedValue(explanationFixture());

    renderExplanation();
    await user.click(screen.getByRole('button', { name: de.fairness.trigger }));

    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByText('ausgeschlossen: hat diese Aufgabe zuletzt erledigt'),
    ).toBeInTheDocument();
    expect(within(dialog).queryByText(/IMMEDIATE_REASSIGNMENT_BLOCKED/)).toBeNull();
  });

  it('zeigt die Lockerungs-Notiz, wenn eine Regel aufgeweicht wurde', async () => {
    const user = userEvent.setup();
    mockedApi.mockResolvedValue(
      explanationFixture({
        constraintsRelaxed: [{ constraint: 'ASSIGNMENT_CAP', reason: 'NO_ELIGIBLE_CANDIDATES' }],
      }),
    );

    renderExplanation();
    await user.click(screen.getByRole('button', { name: de.fairness.trigger }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('note')).toHaveTextContent(
      'Obergrenze für Zufallszuweisungen',
    );
  });
});
