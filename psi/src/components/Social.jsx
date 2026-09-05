import { useStrings, useT } from '../lib/i18n.jsx';
import { useContent } from '../lib/content.jsx';

/* Lenker til sosiale kanaler fra site.social. Merkes med eier når kontoen
   ikke er PSI sin egen, så vi aldri påstår «PSI på Instagram» uten grunn. */
export function socialLinks(site) {
  const out = [];
  for (const [key, network] of [['instagram', 'Instagram'], ['facebook', 'Facebook']]) {
    const c = site.social?.[key];
    if (c?.url) out.push({ key, network, ...c });
  }
  return out;
}

export function SocialLinks({ compact = false }) {
  const s = useStrings();
  const t = useT();
  const { site, organization } = useContent();
  const links = socialLinks(site);
  if (links.length === 0) return null;
  return (
    <ul className={compact ? undefined : 'contact-list'} style={compact ? { listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 2 } : undefined}>
      {links.map((l) => {
        const owner = l.isDedicatedPsiAccount ? organization.shortName : l.owner;
        const text = t(l.label) || `${owner} ${s.contact.on} ${l.network}`;
        return (
          <li key={l.key}>
            <a href={l.url} target="_blank" rel="noopener noreferrer">
              {text}{compact && l.handle ? <span className="muted"> · {l.handle}</span> : null}
            </a>
          </li>
        );
      })}
    </ul>
  );
}
