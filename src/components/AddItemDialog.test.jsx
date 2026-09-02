// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';

// Kassalapp-søket skal ikke ut på nett i en test.
vi.mock('../lib/kassal.js', () => ({
  searchProducts: () => Promise.resolve({ products: [], error: null }),
}));

const { AddItemDialog } = await import('./AddItemDialog.jsx');

function setup(extra = {}) {
  const onAdd = vi.fn(() => Promise.resolve());
  render(
    <AddItemDialog
      entry={{ name: 'Kyllingfilet', major_category: 'Kjøtt', avg_price: 89 }}
      stores={[{ code: 'COOP_EXTRA', name: 'Coop Extra' }]}
      defaultStore="Coop Extra"
      onClose={vi.fn()}
      onAdd={onAdd}
      {...extra}
    />,
  );
  return { onAdd };
}

const qtyField = () => screen.getByLabelText('Antall');

describe('Legg til: mengden dere pleier å kjøpe', () => {
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it('forvelger vanen i stedet for 1', () => {
    setup({ habit: { usual_qty: 3, unit: 'stk', times_bought: 4 } });
    expect(qtyField().value).toBe('3');
  });

  it('sier hvor tallet kommer fra', () => {
    setup({ habit: { usual_qty: 3, unit: 'stk', times_bought: 4 } });
    expect(screen.getByText(/Slik dere pleier: 3 stk/)).toBeTruthy();
    expect(screen.getByText(/4 kvitteringer/)).toBeTruthy();
  });

  it('skriver «kvittering» i entall', () => {
    setup({ habit: { usual_qty: 2, unit: 'stk', times_bought: 1 } });
    expect(screen.getByText(/1 kvittering$/)).toBeTruthy();
  });

  it('lar vanen bestemme enheten også', () => {
    setup({ habit: { usual_qty: 0.5, unit: 'kg', times_bought: 3 } });
    expect(qtyField().value).toBe('0.5');
    expect(screen.getByLabelText('Enhet').value).toBe('kg');
  });

  it('runder av vanen for stykkvarer — 2,7 stk finnes ikke i butikken', () => {
    setup({ habit: { usual_qty: 2.7, unit: 'stk', times_bought: 5 } });
    expect(qtyField().value).toBe('3');
  });

  it('uten vane står forvalget som før', () => {
    setup();
    expect(qtyField().value).toBe('1');
    expect(screen.queryByText(/Slik dere pleier/)).toBeNull();
  });

  it('lar brukeren overstyre vanen', () => {
    const { onAdd } = setup({ habit: { usual_qty: 3, unit: 'stk', times_bought: 4 } });
    fireEvent.change(qtyField(), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: /Legg til 1 stk/ }));
    expect(onAdd).toHaveBeenCalledWith(1, expect.objectContaining({ unit: 'stk' }));
  });

  it('holder vanen unna varer med størrelsesvalg — varianten er PAKNINGEN, ikke antallet', () => {
    // «1-literen» og «tre liter melk i uka» er to forskjellige tall. Blandet
    // sammen ville tre liter blitt priset som én pakning.
    setup({
      entry: { name: 'Lettmelk', major_category: 'Meieri', avg_price: 24.9 },
      habit: { usual_qty: 3, unit: 'liter', times_bought: 6 },
    });
    expect(qtyField().value).toBe('1');
    expect(screen.queryByText(/Slik dere pleier/)).toBeNull();
  });

  it('overser en tom eller ugyldig vane', () => {
    setup({ habit: { usual_qty: 0, unit: 'stk', times_bought: 2 } });
    expect(qtyField().value).toBe('1');
    expect(screen.queryByText(/Slik dere pleier/)).toBeNull();
  });
});
