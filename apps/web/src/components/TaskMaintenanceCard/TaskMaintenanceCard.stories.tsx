import type { Meta, StoryObj } from '@storybook/react-vite';
import { RecurrenceType } from '@haushaltsauktion/shared';
import type { AdminTaskDefinitionDto } from '../../api/types';
import { TaskMaintenanceCard } from './TaskMaintenanceCard';

function makeDefinition(overrides: Partial<AdminTaskDefinitionDto> = {}): AdminTaskDefinitionDto {
  return {
    id: 'def-bad',
    title: 'Bad putzen',
    description: null,
    categoryId: 'cat-bad',
    category: { id: 'cat-bad', name: 'Bad', colorHex: '#5b8def' },
    baseValue: 6,
    estimatedMinutes: 30,
    isActive: true,
    buyoutEnabled: true,
    recurrenceType: RecurrenceType.WEEKLY,
    recurrenceInterval: null,
    recurrenceWeekdays: [6],
    recurrenceDayOfMonth: null,
    recurrenceTimeOfDay: null,
    dueOffsetMinutes: null,
    carriedValue: null,
    lastCompletedAt: null,
    nextDueAt: null,
    archivedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    eligibility: [],
    ...overrides,
  };
}

const meta = {
  title: 'Components/TaskMaintenanceCard',
  component: TaskMaintenanceCard,
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, maxWidth: 520 }}>
        <Story />
      </ul>
    ),
  ],
  args: {
    error: null,
    archiving: false,
    materializing: false,
    onEdit: () => {},
    onEligibility: () => {},
    onArchive: () => {},
    onMaterialize: () => {},
  },
} satisfies Meta<typeof TaskMaintenanceCard>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { definition: makeDefinition() },
};

/** No category assigned to this definition. */
export const NoCategory: Story = {
  args: { definition: makeDefinition({ category: null, categoryId: null }) },
};

/** Archived definitions drop the "Vergeben"/"Archivieren" actions. */
export const Archived: Story = {
  args: { definition: makeDefinition({ archivedAt: new Date().toISOString() }) },
};

export const Materializing: Story = {
  args: { definition: makeDefinition(), materializing: true },
};

export const Archiving: Story = {
  args: { definition: makeDefinition(), archiving: true },
};

/** A rejected archive (e.g. open instances still exist) surfaces inline. */
export const WithError: Story = {
  args: {
    definition: makeDefinition(),
    error: 'Diese Aufgabe hat noch 2 offene Instanzen.',
  },
};

/** Buyout disabled and a non-weekly recurrence, to see the summary text vary. */
export const DailyNoBuyout: Story = {
  args: {
    definition: makeDefinition({
      title: 'Geschirrspüler ausräumen',
      baseValue: 2,
      buyoutEnabled: false,
      recurrenceType: RecurrenceType.DAILY,
      recurrenceWeekdays: [],
    }),
  },
};
