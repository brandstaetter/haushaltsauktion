import { useEffect } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { InstallPrompt } from './InstallPrompt';

const meta = {
  title: 'Components/InstallPrompt',
  component: InstallPrompt,
} satisfies Meta<typeof InstallPrompt>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Hidden — no beforeinstallprompt event fired (renders null). */
export const Hidden: Story = {};

/** Install prompt banner visible after beforeinstallprompt fires. */
export const Visible: Story = {
  render: function Render() {
    useEffect(() => {
      // Dispatch the beforeinstallprompt event that PWA-capable browsers fire
      // when the page is installable. Storybook never fires this naturally,
      // so we stub it here to make the prompt component visible.
      const event = new Event('beforeinstallprompt', { cancelable: true }) as Event & {
        prompt: () => Promise<void>;
        userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
      };
      event.prompt = async () => {
        // Stub: in a real browser, this shows the native install prompt.
      };
      event.userChoice = Promise.resolve({ outcome: 'accepted', platform: 'web' });
      window.dispatchEvent(event);
    }, []);

    return <InstallPrompt />;
  },
};
