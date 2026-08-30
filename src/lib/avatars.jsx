// 50 egne karakter-avatarer, tegnet som SVG rett i koden — ingen eksterne
// bilder, ingen lisensspørsmål. Hver avatar er en deterministisk kombinasjon
// av frisyre/hodeplagg (10), fargepalett (5) og småtrekk (briller, skjegg,
// fregner) avledet av indeksen, så 'a01'–'a50' alltid ser like ut overalt.

const PALETTES = [
  { bg: '#fde8e4', skin: '#f2c7a8', hair: '#3b2e26' },
  { bg: '#e3efe6', skin: '#e8b48c', hair: '#845b38' },
  { bg: '#e7ecf5', skin: '#c98e63', hair: '#1f1b18' },
  { bg: '#f7efdd', skin: '#8d5a3b', hair: '#2c2c2c' },
  { bg: '#f0e6f2', skin: '#f6d7bd', hair: '#b5651d' },
];

const HAIR_COLORS = ['#3b2e26', '#845b38', '#1f1b18', '#b5651d', '#8a8a8a',
  '#d9a441', '#5b3a29', '#222831', '#a52a2a', '#4a4e69'];

// 10 frisyrer/hodeplagg som path-generatorer (viewBox 0 0 64 64, hode i midten)
const HAIR = {
  kort: (c) => <path d="M18 30 Q18 14 32 14 Q46 14 46 30 L46 26 Q46 18 32 18 Q18 18 18 26 Z" fill={c} />,
  bolle: (c) => (
    <>
      <circle cx="32" cy="12" r="6" fill={c} />
      <path d="M17 30 Q17 15 32 15 Q47 15 47 30 L47 24 Q44 18 32 18 Q20 18 17 24 Z" fill={c} />
    </>
  ),
  bob: (c) => <path d="M16 38 Q14 14 32 13 Q50 14 48 38 L44 38 Q46 20 32 19 Q18 20 20 38 Z" fill={c} />,
  krøller: (c) => (
    <>
      {[20, 26, 32, 38, 44].map((x) => <circle key={x} cx={x} cy={x === 32 ? 12 : 15} r="5.5" fill={c} />)}
      <path d="M17 28 Q17 18 32 17 Q47 18 47 28 L17 28 Z" fill={c} />
    </>
  ),
  pigger: (c) => (
    <path d="M18 26 L21 14 L25 22 L29 11 L33 21 L37 12 L41 22 L45 15 L46 26 Q40 18 32 18 Q24 18 18 26 Z" fill={c} />
  ),
  langt: (c) => <path d="M15 46 Q13 13 32 12 Q51 13 49 46 L43 46 Q45 20 32 19 Q19 20 21 46 Z" fill={c} />,
  lue: (c) => (
    <>
      <path d="M17 27 Q17 14 32 14 Q47 14 47 27 Z" fill={c} />
      <rect x="15" y="25" width="34" height="5" rx="2.5" fill={c} />
      <circle cx="32" cy="11" r="3.5" fill={c} opacity="0.75" />
    </>
  ),
  caps: (c) => (
    <>
      <path d="M18 26 Q18 13 32 13 Q46 13 46 26 Z" fill={c} />
      <rect x="30" y="22" width="22" height="4.5" rx="2" fill={c} />
    </>
  ),
  hestehale: (c) => (
    <>
      <path d="M17 30 Q17 14 32 14 Q47 14 47 30 L47 25 Q45 18 32 18 Q19 18 17 25 Z" fill={c} />
      <path d="M45 22 Q54 26 51 40 Q49 34 44 30 Z" fill={c} />
    </>
  ),
  skallet: () => null,
};

const STYLES = Object.keys(HAIR);

/** Deterministisk oppsett for avatar nr. i (0–49). */
function config(i) {
  const p = PALETTES[i % PALETTES.length];
  return {
    palette: p,
    hairStyle: STYLES[Math.floor(i / PALETTES.length) % STYLES.length],
    hairColor: HAIR_COLORS[i % HAIR_COLORS.length],
    glasses: i % 4 === 1,
    beard: i % 5 === 3,
    freckles: i % 3 === 2,
    smile: i % 2 === 0,
  };
}

export const AVATAR_IDS = Array.from({ length: 50 }, (_, i) => `a${String(i + 1).padStart(2, '0')}`);

/** Én avatar som SVG. id='a01'..'a50'; alt annet gir null. */
export function AvatarFace({ id, size = 36 }) {
  const n = /^a(\d\d)$/.exec(String(id ?? ''));
  if (!n) return null;
  const i = Number(n[1]) - 1;
  if (i < 0 || i > 49) return null;
  const c = config(i);
  const { palette: p } = c;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" style={{ display: 'block' }}>
      <circle cx="32" cy="32" r="32" fill={p.bg} />
      {/* Skuldre */}
      <path d="M12 64 Q14 46 32 46 Q50 46 52 64 Z" fill={c.hairColor} opacity="0.85" />
      {/* Hode */}
      <circle cx="32" cy="30" r="14.5" fill={p.skin} />
      {/* Frisyre */}
      {HAIR[c.hairStyle](c.hairColor)}
      {/* Øyne */}
      {c.glasses ? (
        <g stroke="#26221f" strokeWidth="1.6" fill="none">
          <circle cx="26.5" cy="30" r="4" />
          <circle cx="37.5" cy="30" r="4" />
          <line x1="30.5" y1="30" x2="33.5" y2="30" />
          <circle cx="26.5" cy="30" r="1.4" fill="#26221f" stroke="none" />
          <circle cx="37.5" cy="30" r="1.4" fill="#26221f" stroke="none" />
        </g>
      ) : (
        <g fill="#26221f">
          <circle cx="26.5" cy="29.5" r="1.7" />
          <circle cx="37.5" cy="29.5" r="1.7" />
        </g>
      )}
      {/* Fregner */}
      {c.freckles && (
        <g fill="#c98e63" opacity="0.7">
          <circle cx="23" cy="34" r="0.9" /><circle cx="26" cy="35.4" r="0.9" />
          <circle cx="38" cy="35.4" r="0.9" /><circle cx="41" cy="34" r="0.9" />
        </g>
      )}
      {/* Skjegg */}
      {c.beard && (
        <path d="M22 33 Q22 44 32 44 Q42 44 42 33 Q42 41 32 41 Q22 41 22 33 Z" fill={c.hairColor} />
      )}
      {/* Munn */}
      {c.smile ? (
        <path d="M27 37.5 Q32 41.5 37 37.5" stroke="#26221f" strokeWidth="1.7" fill="none" strokeLinecap="round" />
      ) : (
        <line x1="28" y1="38.5" x2="36" y2="38.5" stroke="#26221f" strokeWidth="1.7" strokeLinecap="round" />
      )}
    </svg>
  );
}

/**
 * Brukerens avatar slik den vises overalt: opplastet bilde (URL),
 * SVG-karakter ('aNN'), ellers initialer på aksentfarge.
 */
export function UserAvatar({ avatar, initials, size = 36 }) {
  const style = {
    width: size, height: size, borderRadius: 'var(--radius-full)', flex: 'none',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden', background: 'var(--color-accent)', color: '#fff',
    fontFamily: 'var(--font-heading)', fontWeight: 800,
    fontSize: Math.round(size * 0.36), letterSpacing: '0.02em',
  };
  if (avatar && /^https?:\/\//.test(avatar)) {
    return (
      <span style={style}>
        <img src={avatar} alt="" width={size} height={size} style={{ objectFit: 'cover', width: '100%', height: '100%' }} />
      </span>
    );
  }
  const face = <AvatarFace id={avatar} size={size} />;
  if (face && /^a\d\d$/.test(String(avatar ?? ''))) return <span style={style}>{face}</span>;
  return <span style={style}>{initials}</span>;
}
