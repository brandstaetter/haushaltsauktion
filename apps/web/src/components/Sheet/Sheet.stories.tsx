import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Sheet } from './Sheet';

/**
 * The bottom sheet used for secondary detail (the fairness explanation behind
 * "Warum ich?", buyout confirmation, …). It is a Radix `Dialog` rendered into
 * a portal, so `open: false` genuinely renders nothing into the canvas — the
 * `Open` story below is the one that shows the chrome (drag handle, title,
 * close button, body).
 */
const meta = {
  title: 'Components/Sheet',
  component: Sheet,
  parameters: { layout: 'fullscreen' },
  args: {
    open: true,
    title: 'Warum ich?',
    onOpenChange: () => {},
    children: (
      <>
        <p>Für diese Aufgabe waren 4 Personen verfügbar.</p>
        <p>Anna wurde ausgeschlossen: hat diese Aufgabe zuletzt erledigt.</p>
        <p>Die Auswahl erfolgte zufällig anhand der Fairness-Gewichtung.</p>
      </>
    ),
  },
} satisfies Meta<typeof Sheet>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Open — the sheet's own chrome and a typical body. The primary state worth reviewing. */
export const Open: Story = {};

/** A long body, to check that the sheet scrolls its content instead of overflowing the viewport. */
export const LongContent: Story = {
  args: {
    title: 'Verlauf',
    children: (
      <>
        {Array.from({ length: 20 }, (_, index) => (
          <p key={index}>
            Eintrag {index + 1}: Aufgabe wurde angeboten, niemand hat freiwillig übernommen.
          </p>
        ))}
      </>
    ),
  },
};

/** Closed — the portal renders nothing at all. Documents that the canvas being blank is correct. */
export const Closed: Story = {
  args: { open: false },
};

/** Driven by a trigger, so the open/close transition and the close button can be exercised. */
export const Interactive: Story = {
  args: { open: false },
  render: function Render(args) {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>
          Sheet öffnen
        </button>
        <Sheet {...args} open={open} onOpenChange={setOpen} />
      </>
    );
  },
};
