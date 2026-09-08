import { http, HttpResponse } from 'msw';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { SelectionExplanationDto } from '@haushaltsauktion/shared';
import { mockMembers, mockSelectionExplanation } from '../../mocks/data';
import { AssignmentExplanation } from './AssignmentExplanation';

const meta = {
  title: 'Components/AssignmentExplanation',
  component: AssignmentExplanation,
  args: {
    assignmentId: 'assignment-detail-1',
  },
} satisfies Meta<typeof AssignmentExplanation>;

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * Default state — sheet loads successfully and displays fairness explanation
 * with included/excluded candidates, weights, and selected badge on the winner.
 */
export const Default: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get('/api/assignments/:id/explain', () =>
          HttpResponse.json(mockSelectionExplanation),
        ),
      ],
    },
  },
};

/** Loading state — shows a loading message while fetching the explanation. */
export const Loading: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get('/api/assignments/:id/explain', async () => {
          // Delay indefinitely to show loading state
          await new Promise(() => {});
          return HttpResponse.json({});
        }),
      ],
    },
  },
};

/** Error state — shows error message when the explanation fetch fails. */
export const Error: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get('/api/assignments/:id/explain', () =>
          HttpResponse.json({ error: { code: 'INTERNAL_SERVER_ERROR', message: 'Server error' } }, { status: 500 }),
        ),
      ],
    },
  },
};

/** Constraints relaxed — shows a note explaining which fairness constraints were relaxed due to lack of eligible candidates. */
export const ConstraintsRelaxed: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get('/api/assignments/:id/explain', () =>
          HttpResponse.json({
            ...mockSelectionExplanation,
            constraintsRelaxed: [
              { constraint: 'ASSIGNMENT_CAP', reason: 'NO_ELIGIBLE_CANDIDATES' },
            ],
          } as SelectionExplanationDto),
        ),
      ],
    },
  },
};

/** Preferred candidate — one candidate has a positive `preferredTerm` weight, showing the preferred badge. */
export const WithPreferredBadge: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get('/api/assignments/:id/explain', () =>
          HttpResponse.json({
            ...mockSelectionExplanation,
            candidates: mockSelectionExplanation.candidates.map((c) =>
              c.selected && c.weightTerms
                ? { ...c, weightTerms: { ...c.weightTerms, preferredTerm: 0.5 } }
                : c,
            ),
          } as SelectionExplanationDto),
        ),
      ],
    },
  },
};

/** Most candidates excluded — only one candidate remains eligible after applying hard and soft constraints. */
export const MostExcluded: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get('/api/assignments/:id/explain', () =>
          HttpResponse.json({
            assignmentId: 'assignment-1',
            strategy: 'WEIGHTED_FAIRNESS',
            decidedAt: new Date().toISOString(),
            configVersion: 1,
            eligibleCount: 1,
            constraintsRelaxed: [],
            candidates: [
              {
                memberId: mockMembers[0].id,
                displayName: mockMembers[0].displayName,
                included: false,
                exclusionReason: 'MEMBER_INACTIVE',
                weightTerms: null,
                weight: null,
                probability: null,
                selected: false,
              },
              {
                memberId: mockMembers[1].id,
                displayName: mockMembers[1].displayName,
                included: false,
                exclusionReason: 'CATEGORY_EXCLUDED',
                weightTerms: null,
                weight: null,
                probability: null,
                selected: false,
              },
              {
                memberId: mockMembers[2].id,
                displayName: mockMembers[2].displayName,
                included: false,
                exclusionReason: 'IMMEDIATE_REASSIGNMENT_BLOCKED',
                weightTerms: null,
                weight: null,
                probability: null,
                selected: false,
              },
              {
                memberId: mockMembers[3].id,
                displayName: mockMembers[3].displayName,
                included: true,
                exclusionReason: null,
                weightTerms: null,
                weight: 1,
                probability: 1,
                selected: true,
              },
            ],
          } as SelectionExplanationDto),
        ),
      ],
    },
  },
};

/** Role-based exclusion — shows a candidate excluded due to not having the required role. */
export const RoleExcluded: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get('/api/assignments/:id/explain', () =>
          HttpResponse.json({
            ...mockSelectionExplanation,
            candidates: [
              {
                memberId: mockMembers[0].id,
                displayName: mockMembers[0].displayName,
                included: false,
                exclusionReason: 'ROLE_NOT_ELIGIBLE',
                weightTerms: null,
                weight: null,
                probability: null,
                selected: false,
              },
              {
                memberId: mockMembers[3].id,
                displayName: mockMembers[3].displayName,
                included: true,
                exclusionReason: null,
                weightTerms: null,
                weight: 1.5,
                probability: 1,
                selected: true,
              },
            ],
          } as SelectionExplanationDto),
        ),
      ],
    },
  },
};

/** Multiple constraints relaxed — shows multiple fairness rules that were relaxed. */
export const MultipleConstraintsRelaxed: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get('/api/assignments/:id/explain', () =>
          HttpResponse.json({
            ...mockSelectionExplanation,
            constraintsRelaxed: [
              { constraint: 'IMMEDIATE_REASSIGNMENT', reason: 'NO_ELIGIBLE_CANDIDATES' },
              { constraint: 'ASSIGNMENT_CAP', reason: 'NO_ELIGIBLE_CANDIDATES' },
            ],
          } as SelectionExplanationDto),
        ),
      ],
    },
  },
};
