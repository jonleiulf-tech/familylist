import { Home, ShoppingCart, Lightbulb, UtensilsCrossed, Tag, ListChecks } from 'lucide-react';

// Regler bor ikke lenger som egen fane — de nås som «Preferanser» inne på
// Middag, der de faktisk brukes. Færre faner = roligere app.
export const TABS = [
  { id: 'hjem', label: 'Hjem', Icon: Home },
  { id: 'handel', label: 'Handel', Icon: ShoppingCart },
  { id: 'forslag', label: 'Forslag', Icon: Lightbulb },
  { id: 'middag', label: 'Middag', Icon: UtensilsCrossed },
  { id: 'tilbud', label: 'Tilbud', Icon: Tag },
  { id: 'lister', label: 'Lister', Icon: ListChecks },
];

export function Nav({ tab, onChange, className = 'nav' }) {
  return (
    <nav className={className} aria-label="Hovedmeny">
      {TABS.map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          className="nav-item"
          aria-current={tab === id ? 'page' : undefined}
          onClick={() => onChange(id)}
        >
          <Icon size={16} aria-hidden="true" />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}
