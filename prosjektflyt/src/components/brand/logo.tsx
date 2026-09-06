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

export function ComProWordmark({ className, tone = 'auto' }: { className?: string; tone?: 'auto' | 'dark' | 'light' }) {
  // Ordmerket er 2459×387 px i original; vi viser det med fast høyde.
  const common = 'h-4 w-auto';
  if (tone === 'dark') {
    return <Image src="/brand/wordmark-black.png" alt="COMPRO" width={1200} height={189} className={cn(common, className)} priority />;
  }
  if (tone === 'light') {
    return <Image src="/brand/wordmark-white.png" alt="COMPRO" width={1200} height={189} className={cn(common, className)} priority />;
  }
  return (
    <>
      <Image src="/brand/wordmark-black.png" alt="COMPRO" width={1200} height={189} className={cn(common, 'dark:hidden', className)} priority />
      <Image src="/brand/wordmark-white.png" alt="" aria-hidden width={1200} height={189} className={cn(common, 'hidden dark:block', className)} priority />
    </>
  );
}

/** Ikon + ordmerke side om side. */
export function ComProLogo({ className, markClassName, wordmarkClassName }: { className?: string; markClassName?: string; wordmarkClassName?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <ComProMark className={markClassName} />
      <ComProWordmark className={wordmarkClassName} />
    </span>
  );
}
