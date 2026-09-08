import { useEffect, useRef, type ReactElement } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { PushSection } from './PushSection';

/**
 * The Web Push opt-in card. Every branch it renders is driven by two browser
 * facts rather than by the API: `Notification.permission` (read synchronously
 * during render via `currentPermission()`) and whether
 * `navigator.serviceWorker.ready.pushManager.getSubscription()` resolves to a
 * subscription (`usePushSubscriptionStatus`, which is a `useQuery` over a
 * browser call, not a backend one — see `src/api/hooks.ts`).
 *
 * So these stories stub those two globals rather than mocking endpoints. The
 * stubs are installed during the decorator's own render — before `Story`
 * renders and before the query function runs — and torn down on unmount, so
 * one story never leaks its environment into the next.
 *
 * NOT represented here: the subscribe/unsubscribe *error* states. Reaching
 * them needs `subscribe.mutate()` to run for real, and that calls
 * `Notification.requestPermission()` followed by `pushManager.subscribe()`
 * against a live push service with a real VAPID key. Faking that deeply enough
 * to be meaningful would be testing the stub, not the component, so the
 * failure copy is left to `AccountPage.test.tsx` instead of a story that would
 * only ever render a spinner.
 */

interface PushEnvironment {
  /** Omit to delete `Notification` entirely — the "browser has no Push" branch. */
  permission?: NotificationPermission;
  /** Whether `getSubscription()` resolves to a subscription. Ignored when `pending`. */
  subscribed?: boolean;
  /** Leaves `getSubscription()` unresolved, so the card stays in its loading state. */
  pending?: boolean;
}

/** Undoes whatever `installPushEnvironment` changed, restoring the real globals. */
type RestorePushEnvironment = () => void;

function defineGlobal(target: object, property: string, value: unknown): () => void {
  const original = Object.getOwnPropertyDescriptor(target, property);
  Object.defineProperty(target, property, { value, writable: true, configurable: true });
  return () => {
    if (original) Object.defineProperty(target, property, original);
    else Reflect.deleteProperty(target, property);
  };
}

function installPushEnvironment({
  permission,
  subscribed = false,
  pending = false,
}: PushEnvironment): RestorePushEnvironment {
  const undo: Array<() => void> = [];

  if (permission === undefined) {
    // `currentPermission()` checks `typeof Notification === 'undefined'`, and
    // `readBrowserPushSubscription()` checks `'PushManager' in window` — remove
    // both so the unsupported branch is reached the same way it would be in a
    // browser without Push.
    undo.push(defineGlobal(globalThis, 'Notification', undefined));
    undo.push(defineGlobal(globalThis, 'PushManager', undefined));
    return () => undo.forEach((restore) => restore());
  }

  undo.push(
    defineGlobal(globalThis, 'Notification', {
      permission,
      requestPermission: async () => permission,
    }),
  );

  // `'PushManager' in window` must hold for the subscription read to happen at all.
  if (!('PushManager' in globalThis)) {
    undo.push(defineGlobal(globalThis, 'PushManager', class {}));
  }

  const registration = {
    pushManager: {
      getSubscription: async () =>
        pending ? new Promise(() => {}) : subscribed ? { endpoint: 'https://push.example/abc' } : null,
    },
  };
  undo.push(defineGlobal(navigator, 'serviceWorker', { ready: Promise.resolve(registration) }));

  return () => undo.forEach((restore) => restore());
}

function withPushEnvironment(environment: PushEnvironment) {
  return function PushEnvironmentDecorator(Story: () => ReactElement): ReactElement {
    // Installed inline rather than in an effect: `currentPermission()` runs
    // during the child's render, which happens before any effect fires.
    const restore = useRef<RestorePushEnvironment | null>(null);
    if (restore.current === null) restore.current = installPushEnvironment(environment);

    useEffect(
      () => () => {
        restore.current?.();
        restore.current = null;
      },
      [],
    );

    return <Story />;
  };
}

const meta = {
  title: 'Pages/AccountPage/PushSection',
  component: PushSection,
  args: { enabled: true },
} satisfies Meta<typeof PushSection>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Household switch is off — the card renders nothing at all, before any browser check. */
export const Disabled: Story = {
  args: { enabled: false },
};

/** The browser subscription read has not resolved yet — the spinner. */
export const Loading: Story = {
  decorators: [withPushEnvironment({ permission: 'default', pending: true })],
};

/** No `Notification`/`PushManager` at all (e.g. Safari in a plain tab) — the "not supported" note. */
export const Unsupported: Story = {
  decorators: [withPushEnvironment({})],
};

/** Blocked at the OS/browser level — an alert telling the member to change it themselves, and no button that would silently fail. */
export const PermissionDenied: Story = {
  decorators: [withPushEnvironment({ permission: 'denied' })],
};

/** Push is available and not yet enabled on this device — the opt-in button, plus the §31 per-device and iOS caveats. */
export const NotSubscribed: Story = {
  decorators: [withPushEnvironment({ permission: 'default' })],
};

/** Already subscribed on this device — the confirmation and the opt-out button instead. */
export const Subscribed: Story = {
  decorators: [withPushEnvironment({ permission: 'granted', subscribed: true })],
};

/** The opt-in state at 390px, where this card actually gets used (§19). */
export const Mobile: Story = {
  globals: { viewport: { value: 'iphone13', isRotated: false } },
  decorators: [withPushEnvironment({ permission: 'default' })],
};
