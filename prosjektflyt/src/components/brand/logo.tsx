import Image from 'next/image';
import { cn } from '@/lib/utils/cn';

/**
 * ComPro-merket. Ikonet er gjenskapt eksakt som SVG fra original-EPS
 * (geometrien ligger på et 10-rutenett), ordmerket «COMPRO» er trukket ut
 * av original-logoen (public/brand/wordmark-*.png) – uten «ARTISTS».
 */

const MARK_PATHS = [
  // Øvre/høyre hake
  '450,200 800,200 800,550 600,550 600,450 700,450 700,300 550,300 550,800 450,800',
  // Nedre/venstre hake (180° rotert)
  '550,800 200,800 200,450 400,450 400,550 300,550 300,700 450,700 450,200 550,200',
];

/** Ordmerket er 2459×387 px i original → bredde/høyde-forhold. */
const WORDMARK_RATIO = 2459 / 387;

export function ComProMark({
  className,
  variant = 'dark',
  title = 'ComPro',
}: {
  className?: string;
  /** dark = mørkt kvadrat med hvit figur (original), light = hvitt kvadrat med mørk figur. */
  variant?: 'dark' | 'light';
  title?: string;
}) {
  const bg = variant === 'dark' ? '#1d1d1b' : '#ffffff';
  const fg = variant === 'dark' ? '#ffffff' : '#1d1d1b';
  return (
    <svg viewBox="0 0 1000 1000" role="img" aria-label={title} className={cn('h-8 w-8 shrink-0', className)}>
      <rect width="1000" height="1000" fill={bg} />
      {MARK_PATHS.map((points) => (
        <polygon key={points} points={points} fill={fg} />
      ))}
    </svg>
  );
}

/**
 * Ordmerket «COMPRO». Eksplisitt bredde/høyde (ikke CSS-høyde) slik at
 * next/image aldri faller tilbake til intrinsisk størrelse på små skjermer.
 */
export function ComProWordmark({
  height = 16,
  className,
  tone = 'auto',
}: {
  height?: number;
  className?: string;
  tone?: 'auto' | 'dark' | 'light';
}) {
  const width = Math.round(height * WORDMARK_RATIO);
  const dark = (
    <Image
      src="/brand/wordmark-black.png"
      alt="COMPRO"
      width={width}
      height={height}
      className={cn('shrink-0', tone === 'auto' && 'dark:hidden', className)}
      priority
    />
  );
  const light = (
    <Image
      src="/brand/wordmark-white.png"
      alt={tone === 'auto' ? '' : 'COMPRO'}
      aria-hidden={tone === 'auto' ? true : undefined}
      width={width}
      height={height}
      className={cn('shrink-0', tone === 'auto' && 'hidden dark:block', className)}
      priority
    />
  );
  if (tone === 'dark') return dark;
  if (tone === 'light') return light;
  return (
    <>
      {dark}
      {light}
    </>
  );
}

/** Ikon + ordmerke side om side. */
export function ComProLogo({
  className,
  markClassName,
  wordmarkHeight = 16,
}: {
  className?: string;
  markClassName?: string;
  wordmarkHeight?: number;
}) {
  return (
    <span className={cn('inline-flex shrink-0 items-center gap-2.5', className)}>
      <ComProMark className={markClassName} />
      <ComProWordmark height={wordmarkHeight} />
    </span>
  );
}
