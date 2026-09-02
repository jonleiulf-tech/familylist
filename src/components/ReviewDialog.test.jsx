// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { ReviewDialog } from './ReviewDialog.jsx';

const rows = [
  { name: 'Kjøttdeig', qty: 1, unit: 'pakke', category: 'Kjøtt' },
  { name: 'Spagetti', qty: 1, unit: 'stk', category: 'Tørrvarer' },
  { name: 'Ketchup', qty: 1, unit: 'stk', category: 'Krydder og saus' },
];

function setup(extra = {}) {
  const onSubmit = vi.fn();
  render(
    <ReviewDialog
      title="Ingredienser"
      rows={rows}
      existingNames={new Set(['kjøttdeig'])}
      onCancel={vi.fn()}
      onSubmit={onSubmit}
      {...extra}
    />,
  );
  return { onSubmit };
}

describe('Gjennomgangen: det som alt ligger på listen', () => {
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it('står nederst og uten hake', () => {
    setup();
    const boxes = screen.getAllByRole('checkbox');
    expect(boxes.map((b) => b.getAttribute('aria-label')))
      .toEqual(['Spagetti', 'Ketchup', 'Kjøttdeig']);
    expect(boxes.map((b) => b.checked)).toEqual([true, true, false]);
  });

  it('sender bare det som er avhuket', async () => {
    const { onSubmit } = setup();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Send til handlelisten/ }));
    });
    const [selected] = onSubmit.mock.calls[0];
    expect(selected.map((r) => r.name)).toEqual(['Spagetti', 'Ketchup']);
  });

  it('kan hukes på igjen om man vil ha mer', () => {
    setup();
    const box = screen.getByRole('checkbox', { name: 'Kjøttdeig' });
    act(() => { fireEvent.click(box); });
    expect(screen.getByRole('button', { name: /Send til handlelisten \(3\)/ })).toBeTruthy();
  });
});
