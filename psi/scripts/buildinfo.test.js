import { describe, it, expect } from 'vitest';
import { buildId, buildTime } from './buildinfo.mjs';

describe('buildId', () => {
  it('bruker Vercel sin commit-sha', () => {
    expect(buildId({ VERCEL_GIT_COMMIT_SHA: '03057633c1e0c174833dcc4f8a564ae6f0151393' }, () => '')).toBe('0305763');
  });

  it('faller tilbake til GitHub sin sha', () => {
    expect(buildId({ GITHUB_SHA: 'abcdef1234567890' }, () => '')).toBe('abcdef1');
  });

  it('spør git når ingen miljøvariabel finnes', () => {
    expect(buildId({}, () => 'fedcba9876\n')).toBe('fedcba9');
  });

  it('sier «lokal» når ingenting er kjent, i stedet for å velte bygget', () => {
    expect(buildId({}, () => '')).toBe('lokal');
  });
});

describe('buildTime', () => {
  it('gir UTC på minuttet', () => {
    expect(buildTime(new Date('2026-09-05T21:37:58.304Z'))).toBe('2026-09-05 21:37');
  });
});
