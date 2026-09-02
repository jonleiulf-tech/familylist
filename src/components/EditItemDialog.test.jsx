// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { EditItemDialog } from './EditItemDialog.jsx';

const item = {
  id: 'i1', name: 'Ketchup, Heinz', qty: 1, unit: 'stk', store: 'Coop Extra',
  price: 49.17, price_source: 'kassalapp', category: 'Krydder og saus',
  kassal_name: 'Heinz Tomatketchup 700 g',
};

function setup(extra = {}) {
  const onSave = vi.fn();
  render(
    <EditItemDialog
      item={item}
      stores={[{ code: 'COOP_EXTRA', name: 'Coop Extra' }]}
      onClose={vi.fn()}
      onSave={onSave}
      onDelete={vi.fn()}
      onReport={vi.fn()}
      {...extra}
    />,
  );
  return { onSave };
}

const type = (label, value) => {
  const field = screen.getByLabelText(label, { selector: 'input' });
  act(() => { fireEvent.change(field, { target: { value } }); });
};

describe('Rediger vare på handlelisten', () => {
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it('navnet kan endres, og kategorien følger varedatabasen', () => {
    const onResolveName = vi.fn(() => ({ name: 'Ketchup', category: 'Krydder og saus' }));
    const { onSave } = setup({ onResolveName });
    type('Varenavn', 'Ketchup');
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Lagre' })); });
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Ketchup', category: 'Krydder og saus',
    }));
  });

  it('en omdøpt vare får prisen merket som anslag', () => {
    const { onSave } = setup();
    type('Varenavn', 'Ketchup');
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Lagre' })); });
    expect(onSave.mock.calls[0][0].price_source).toBe('manual');
  });

  it('uendret navn sender ikke navnet, og prisen beholder kilden', () => {
    const { onSave } = setup();
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Lagre' })); });
    expect(onSave.mock.calls[0][0].name).toBeUndefined();
    expect(onSave.mock.calls[0][0].price_source).toBe('kassalapp');
  });

  it('sier fra når navnet alt finnes på listen', () => {
    setup({ otherNames: new Set(['ketchup']) });
    type('Varenavn', 'Ketchup');
    expect(screen.getByText(/ligger alt på listen/)).toBeTruthy();
  });

  it('bytte av enhet regner om mengden', () => {
    const { onSave } = setup({ item: { ...item, qty: 500, unit: 'g' } });
    const unit = screen.getByLabelText('Enhet', { selector: 'select' });
    act(() => { fireEvent.change(unit, { target: { value: 'kg' } }); });
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Lagre' })); });
    expect(onSave.mock.calls[0][0]).toMatchObject({ qty: 0.5, unit: 'kg' });
  });
});
