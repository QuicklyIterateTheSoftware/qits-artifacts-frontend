import {
  NONE,
  UNKNOWN_SIZE,
  formatBytes,
  formatDayTime,
  formatInstant,
  isCommitSha,
  itemNoun,
  plural,
  shortDigest,
  shortSha,
} from './format';

describe('formatBytes', () => {
  it('always carries a unit — a bare number on a deduped store is the whole bug', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1023)).toBe('1023 B');
    expect(formatBytes(1024)).toBe('1.00 KiB');
  });

  it('uses binary units, matching every measurement behind this UI', () => {
    expect(formatBytes(4337916518)).toBe('4.04 GiB');
    expect(formatBytes(171952091)).toBe('164 MiB');
    expect(formatBytes(87040)).toBe('85.0 KiB');
  });

  it('drops the decimals once three significant figures no longer fit', () => {
    expect(formatBytes(650825871)).toBe('621 MiB');
  });

  it('says "not measured" for a null, never "0 B" — unknown is not zero', () => {
    expect(formatBytes(null)).toBe(UNKNOWN_SIZE);
    expect(formatBytes(undefined)).toBe(UNKNOWN_SIZE);
    expect(formatBytes(Number.NaN)).toBe(UNKNOWN_SIZE);
  });
});

describe('isCommitSha', () => {
  it('accepts the full 40-hex form qits-cd usually tags with', () => {
    expect(isCommitSha('9f96484aa1c0d1e2f3a4b5c6d7e8f90123456789')).toBe(true);
  });

  it('accepts the abbreviated form, because qits-observability carries both', () => {
    expect(isCommitSha('9f96484')).toBe(true);
    expect(isCommitSha('9f96484aa1c0')).toBe(true);
  });

  it('rejects the tags that are plainly not commits', () => {
    expect(isCommitSha('latest')).toBe(false);
    expect(isCommitSha('0.0.4')).toBe(false);
    expect(isCommitSha('9F96484')).toBe(false);
    expect(isCommitSha('9f9648')).toBe(false);
  });
});

describe('the small conversions', () => {
  it('shortens a sha to git’s own seven, and leaves a shorter one alone', () => {
    expect(shortSha('9f96484aa1c0d1e2f3a4b5c6d7e8f90123456789')).toBe('9f96484');
    expect(shortSha('9f96484')).toBe('9f96484');
  });

  it('keeps the algorithm on a shortened digest, so it stays recognisable', () => {
    expect(shortDigest('sha256:0123456789abcdef0123')).toBe('sha256:0123456789ab');
  });

  it('never prints a count without its noun, and counts the right noun per type', () => {
    expect(plural(1, 'image')).toBe('1 image');
    expect(plural(10, 'image')).toBe('10 images');
    expect(plural(1, 'repository', 'repositories')).toBe('1 repository');
    expect(itemNoun('oci-images')).toBe('image');
    expect(itemNoun('npm-packages')).toBe('package');
    expect(itemNoun('ci-screenshots')).toBe('record');
    expect(itemNoun('maven-packages')).toBe('file');
    expect(itemNoun('daemon-binaries')).toBe('version');
  });

  // A docs repository counts published VERSIONS — not the sites above them and not the fifty-odd
  // files below. Falling through to `record` was the visible half of a union that had gone stale.
  it('counts a docs repository in versions, not sites and not files', () => {
    expect(itemNoun('docs')).toBe('version');
    expect(itemNoun('docs')).not.toBe('record');
    expect(plural(2, itemNoun('docs'))).toBe('2 versions');
  });

  it('renders every timestamp in UTC, and an absent one as an em dash', () => {
    expect(formatInstant('2026-07-31T14:06:23Z')).toBe('31 Jul 2026 14:06:23Z');
    expect(formatDayTime('2026-07-31T14:06:23Z')).toBe('31 Jul 14:06');
    expect(formatInstant(null)).toBe(NONE);
    expect(formatDayTime('not a date')).toBe(NONE);
  });
});
