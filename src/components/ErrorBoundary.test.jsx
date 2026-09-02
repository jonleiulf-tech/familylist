// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { useState } from 'react';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { ErrorBoundary } from './ErrorBoundary.jsx';

function Bang({ boom, text }) {
  if (boom) throw new Error(text ?? 'Kaboom fra en fane');
  return <div>Fanen virker</div>;
}

describe('ErrorBoundary', () => {
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it('viser feilkort med feilteksten i stedet for blank skjerm', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<ErrorBoundary resetKey="middag"><Bang boom /></ErrorBoundary>);
    expect(screen.getByText('Her gikk noe galt')).toBeTruthy();
    expect(screen.getByText(/Kaboom fra en fane/)).toBeTruthy();
  });

  it('«Prøv igjen» tegner innholdet på nytt', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const Wrapper = () => {
      const [boom, setBoom] = useState(true);
      return (
        <>
          <button type="button" onClick={() => setBoom(false)}>Fiks</button>
          <ErrorBoundary resetKey="middag"><Bang boom={boom} /></ErrorBoundary>
        </>
      );
    };
    render(<Wrapper />);
    act(() => { fireEvent.click(screen.getByText('Fiks')); });
    act(() => { fireEvent.click(screen.getByRole('button', { name: /Prøv igjen/ })); });
    expect(screen.getByText('Fanen virker')).toBeTruthy();
  });

  it('fanebytte nullstiller feilen', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { rerender } = render(
      <ErrorBoundary resetKey="middag"><Bang boom /></ErrorBoundary>,
    );
    expect(screen.getByText('Her gikk noe galt')).toBeTruthy();
    rerender(<ErrorBoundary resetKey="handel"><Bang /></ErrorBoundary>);
    expect(screen.getByText('Fanen virker')).toBeTruthy();
  });

  it('laster appen på nytt én gang når en lat-lastet fil er borte', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const reload = vi.fn();
    const original = window.location;
    delete window.location;
    window.location = { ...original, reload };
    sessionStorage.clear();
    try {
      render(
        <ErrorBoundary resetKey="middag">
          <Bang boom text="Failed to fetch dynamically imported module: /assets/x.js" />
        </ErrorBoundary>,
      );
      expect(reload).toHaveBeenCalledTimes(1);
      cleanup();
      // Andre gang skal den IKKE laste på nytt — da ville vi fått en løkke.
      render(
        <ErrorBoundary resetKey="middag">
          <Bang boom text="Failed to fetch dynamically imported module: /assets/x.js" />
        </ErrorBoundary>,
      );
      expect(reload).toHaveBeenCalledTimes(1);
      expect(screen.getByText('Her gikk noe galt')).toBeTruthy();
    } finally {
      window.location = original;
      sessionStorage.clear();
    }
  });
});
