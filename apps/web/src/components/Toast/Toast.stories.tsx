import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Toast } from './Toast';

const meta = {
  title: 'Components/Toast',
  component: Toast,
  args: {
    duration: 5000,
    onDismiss: () => {},
  },
} satisfies Meta<typeof Toast>;

export default meta;

type Story = StoryObj<typeof meta>;

/** No message — renders as null (empty). */
export const Hidden: Story = {
  args: {
    message: null,
  },
};

/** Status message (default variant) with role="status" — auto-dismisses after 5 seconds or on manual close. */
export const StatusMessage: Story = {
  args: {
    message: 'Aufgabe erfolgreich gespeichert.',
    variant: 'status',
  },
  render: function Render(args) {
    const [message, setMessage] = useState(args.message);
    return (
      <Toast
        {...args}
        message={message}
        onDismiss={() => setMessage(null)}
      />
    );
  },
};

/** Error message with role="alert" and assertive aria-live — auto-dismisses after configured duration. */
export const ErrorMessage: Story = {
  args: {
    message: 'Das hat nicht funktioniert. Bitte versuchen Sie es erneut.',
    variant: 'error',
  },
  render: function Render(args) {
    const [message, setMessage] = useState(args.message);
    return (
      <Toast
        {...args}
        message={message}
        onDismiss={() => setMessage(null)}
      />
    );
  },
};

/** Shorter auto-dismiss duration (1 second) — demonstrates rapid dismissal. */
export const QuickDismiss: Story = {
  args: {
    message: 'Schnell gelöscht!',
    variant: 'status',
    duration: 1000,
  },
  render: function Render(args) {
    const [message, setMessage] = useState(args.message);
    return (
      <Toast
        {...args}
        message={message}
        onDismiss={() => setMessage(null)}
      />
    );
  },
};

/** Longer auto-dismiss duration (10 seconds) — useful for important messages that need reader attention. */
export const LongDuration: Story = {
  args: {
    message: 'Wichtige Mitteilung — bleibt 10 Sekunden sichtbar.',
    variant: 'status',
    duration: 10000,
  },
  render: function Render(args) {
    const [message, setMessage] = useState(args.message);
    return (
      <Toast
        {...args}
        message={message}
        onDismiss={() => setMessage(null)}
      />
    );
  },
};
