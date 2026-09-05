// Hvilken commit som faktisk ligger ute. Uten dette er «er det deployet?»
// umulig å svare på uten å gjette – merket vises i bunnteksten og som
// <meta name="psi-build"> i kildekoden.
import { execSync } from 'node:child_process';

function fraGit() {
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return '';
  }
}

export function buildId(env = process.env, git = fraGit) {
  const sha = env.VERCEL_GIT_COMMIT_SHA || env.GITHUB_SHA || git() || '';
  const kort = String(sha).trim().slice(0, 7);
  return kort || 'lokal';
}

export function buildTime(now = new Date()) {
  // 2026-09-05 21:37 UTC – kort nok til bunnteksten, presist nok til å skille
  // to utrullinger samme dag.
  const p = (n) => String(n).padStart(2, '0');
  return `${now.getUTCFullYear()}-${p(now.getUTCMonth() + 1)}-${p(now.getUTCDate())} ${p(now.getUTCHours())}:${p(now.getUTCMinutes())}`;
}
