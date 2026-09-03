import type { Meta, StoryObj } from '@storybook/react-vite';
import type { AdminMemberDto } from '../../api/types';
import { UserMaintenanceCard, draftFromMember } from './UserMaintenanceCard';

function makeMember(overrides: Partial<AdminMemberDto> = {}): AdminMemberDto {
  return {
    id: 'member-anna',
    displayName: 'Anna',
    avatarUrl: null,
    role: 'MEMBER',
    isActive: true,
    pointsCache: 42,
    maxRandomAssignmentsPerWeek: null,
    user: { email: 'anna@example.com', isActive: true },
    categoryExclusions: [],
    absences: [],
    taskEligibility: [],
    ...overrides,
  };
}

const meta = {
  title: 'Components/UserMaintenanceCard',
  component: UserMaintenanceCard,
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
    saving: false,
    onChange: () => {},
    onSave: () => {},
    onOpenRestrictions: () => {},
    onOpenResetPassword: () => {},
  },
} satisfies Meta<typeof UserMaintenanceCard>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Freshly loaded — matches the saved member, so "Speichern" is disabled. */
export const Default: Story = {
  args: {
    member: makeMember(),
    draft: draftFromMember(makeMember()),
  },
};

/** Role changed but not yet saved — "Speichern" becomes enabled. */
export const Dirty: Story = {
  args: {
    member: makeMember(),
    draft: { role: 'ADMIN', isActive: true, maxRandomAssignmentsPerWeek: null },
  },
};

export const Saving: Story = {
  args: {
    member: makeMember(),
    draft: { role: 'ADMIN', isActive: true, maxRandomAssignmentsPerWeek: null },
    saving: true,
  },
};

/** A capped weekly random-assignment count instead of the "∞" default. */
export const AssignmentCap: Story = {
  args: {
    member: makeMember({ maxRandomAssignmentsPerWeek: 3 }),
    draft: draftFromMember(makeMember({ maxRandomAssignmentsPerWeek: 3 })),
  },
};

export const Inactive: Story = {
  args: {
    member: makeMember({ isActive: false }),
    draft: draftFromMember(makeMember({ isActive: false })),
  },
};

/** A rejected save (e.g. removing the last admin) surfaces inline. */
export const WithError: Story = {
  args: {
    member: makeMember(),
    draft: draftFromMember(makeMember()),
    error: 'Es muss mindestens ein Admin verbleiben.',
  },
};
