// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act, within } from '@testing-library/react';
import { ShopMode } from './ShopMode.jsx';

const items = [
  { id: 'i1', name: 'Macaroni', qty: 1, unit: 'pakke', pack_size: 400, category: 'Tørrvarer', store: 'Coop Extra', checked: false, price: 20 },
  { id: 'i2', name: 'Tørre stellekluter', qty: 1, unit: 'stk', category: 'Hus og hjem', store: 'Coop Extra', checked: false, price: 40 },
];

const stores = [
  { code: 'COOP_EXTRA', name: 'Coop Extra' },
  { code: 'MENY', name: 'Meny' },
];

function setup(extra = {}) {
  const onUpdateItem = vi.fn();
  const onRemoveItem = vi.fn();
  const onFinishStore = vi.fn();
  render(
    <ShopMode
      items={items}
      stores={stores}
      activeStore="Coop Extra"
      onPickStore={vi.fn()}
      positionOf={() => null}
      hasLearnedFor={() => false}
      defaultStore="Coop Extra"
      onToggle={vi.fn()}
      onComplete={vi.fn()}
      onClose={vi.fn()}
      onUpdateItem={onUpdateItem}
      onRemoveItem={onRemoveItem}
      onFinishStore={onFinishStore}
      {...extra}
    />,
  );
  return { onUpdateItem, onRemoveItem, onFinishStore };
}

const click = (el) => act(() => { fireEvent.click(el); });

describe('Butikkmodus: rettelser ved hylla', () => {
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it('hver rad har en knapp for å endre varen', () => {
    setup();
    expect(screen.getByRole('button', { name: 'Endre Macaroni' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Endre Tørre stellekluter' })).toBeTruthy();
  });

  it('«Fjern fra listen» melder varen tilbake til Handel', () => {
    const { onRemoveItem } = setup();
    click(screen.getByRole('button', { name: 'Endre Macaroni' }));
    click(screen.getByRole('button', { name: /Fjern fra listen/ }));
    expect(onRemoveItem).toHaveBeenCalledWith(expect.objectContaining({ id: 'i1' }));
  });

  it('bytte butikk flytter varen dit', () => {
    const { onUpdateItem } = setup();
    click(screen.getByRole('button', { name: 'Endre Macaroni' }));
    // Butikkvelgeren i toppen har samme navn — hold oss inne i panelet.
    const sheet = screen.getByRole('dialog', { name: 'Endre Macaroni' });
    click(within(sheet).getByRole('button', { name: /^Meny/ }));
    expect(onUpdateItem).toHaveBeenCalledWith('i1', { store: 'Meny' });
  });

  it('butikken man står i er merket, og lukker bare panelet', () => {
    const { onUpdateItem } = setup();
    click(screen.getByRole('button', { name: 'Endre Macaroni' }));
    const sheet = screen.getByRole('dialog', { name: 'Endre Macaroni' });
    click(within(sheet).getByRole('button', { name: /Coop Extra.*her nå/ }));
    expect(onUpdateItem).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog', { name: 'Endre Macaroni' })).toBe(null);
  });

  it('antall steppes i pakker for gram-varer', () => {
    const { onUpdateItem } = setup({
      items: [{ ...items[0], qty: 800, unit: 'g', pack_size: 400 }],
    });
    click(screen.getByRole('button', { name: 'Endre Macaroni' }));
    click(screen.getByRole('button', { name: 'Færre' }));
    expect(onUpdateItem).toHaveBeenCalledWith('i1', { qty: 400 });
  });

  it('minus under én pakke er sperret — fjerning er en egen knapp', () => {
    setup({ items: [{ ...items[0], qty: 400, unit: 'g', pack_size: 400 }] });
    click(screen.getByRole('button', { name: 'Endre Macaroni' }));
    expect(screen.getByRole('button', { name: 'Færre' }).disabled).toBe(true);
  });
});

describe('Butikkmodus: én butikk av gangen', () => {
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  const toStores = [
    { id: 'c1', name: 'Macaroni', qty: 1, unit: 'pakke', category: 'Tørrvarer', store: 'Coop Extra', checked: true, price: 20 },
    { id: 'c2', name: 'Laksefilet', qty: 1, unit: 'pakke', category: 'Fisk', store: 'Coop Extra', checked: true, price: 90 },
    { id: 'm1', name: 'Havremelk', qty: 1, unit: 'liter', category: 'Meieri', store: 'Meny', checked: false, price: 58 },
  ];

  it('tilbyr «Ferdig på Coop Extra» med neste butikk i knappen', () => {
    setup({ items: toStores });
    const btn = screen.getByRole('button', { name: /Ferdig på Coop Extra/ });
    expect(btn.textContent).toMatch(/videre til Meny/);
  });

  it('knappen melder butikken ferdig', () => {
    const { onFinishStore } = setup({ items: toStores });
    click(screen.getByRole('button', { name: /Ferdig på Coop Extra/ }));
    expect(onFinishStore).toHaveBeenCalledWith('Coop Extra');
  });

  it('ingen andre butikker igjen → bare «Fullfør handletur»', () => {
    setup({ items: toStores.map((i) => ({ ...i, store: 'Coop Extra' })) });
    expect(screen.queryByRole('button', { name: /Ferdig på/ })).toBe(null);
    expect(screen.getByRole('button', { name: /Fullfør handletur/ })).toBeTruthy();
  });

  it('ingenting plukket her ennå → ingen «ferdig her»-knapp', () => {
    setup({ items: toStores.map((i) => ({ ...i, checked: false })) });
    expect(screen.queryByRole('button', { name: /Ferdig på/ })).toBe(null);
  });
});
