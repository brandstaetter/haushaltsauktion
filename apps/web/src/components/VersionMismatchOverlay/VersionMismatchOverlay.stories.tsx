import { useEffect } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { checkVersionHeader } from '../../api/versionCheck';
import { VersionMismatchOverlay } from './VersionMismatchOverlay';

const meta = {
  title: 'Components/VersionMismatchOverlay',
  component: VersionMismatchOverlay,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof VersionMismatchOverlay>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Hidden — no version mismatch detected (renders null). */
export const Hidden: Story = {};

/** Version mismatch detected — shows blocking overlay with no dismiss option. */
export const Mismatch: Story = {
  render: function Render() {
    useEffect(() => {
      // Simulate a version mismatch response from the server.
      // When a real response comes in with a different x-app-version header,
      // checkVersionHeader() fires all subscribers.
      const response = new Response(null, {
        headers: { 'x-app-version': 'deploy-abc123' },
      });
      checkVersionHeader(response);
    }, []);

    return <VersionMismatchOverlay />;
  },
};
