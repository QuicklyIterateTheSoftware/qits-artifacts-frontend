import type { MirrorUpstreamDto } from '../api/dto';
import {
  clashProblem,
  cleanDomain,
  cleanSlug,
  domainProblem,
  pullPrefix,
  slugProblem,
} from './upstream-rules';

/**
 * The client's copy of the service's rules, asserted against the values that make the copy worth
 * having: the three the service accepts today, and the shapes it refuses.
 *
 * The assertion that earns its keep is the **asymmetric normalisation** — the domain is lowercased
 * for you and the slug is not. Getting that backwards would either send a value the service
 * refuses or refuse one it would have taken, and it is invisible in every other test.
 */
describe('upstream rules', () => {
  const upstream = (domain: string, slug: string): MirrorUpstreamDto => ({
    domain,
    slug,
    createdAt: '2026-08-01T13:50:45Z',
    cachedImages: 0,
  });

  const registered = [
    upstream('docker.io', 'hub'),
    upstream('quay.io', 'quay'),
    upstream('registry.access.redhat.com', 'redhat'),
  ];

  it('accepts the three domains this platform actually mirrors', () => {
    for (const row of registered) {
      expect(domainProblem(row.domain)).toBeNull();
      expect(slugProblem(row.slug)).toBeNull();
    }
  });

  it('lowercases the domain and does not lowercase the slug', () => {
    expect(cleanDomain('  Quay.IO ')).toBe('quay.io');
    expect(domainProblem('  Quay.IO ')).toBeNull();

    expect(cleanSlug('  quay ')).toBe('quay');
    expect(slugProblem('Quay')).toContain('lowercase');
  });

  it('refuses what is not a registry domain, including a bare host', () => {
    expect(domainProblem('')).toContain('A domain is needed');
    expect(domainProblem('localhost')).toContain('Not a registry domain');
    expect(domainProblem('https://quay.io')).toContain('Not a registry domain');
    expect(domainProblem('quay.io/quarkus')).toContain('Not a registry domain');
    expect(domainProblem('quay.io:8443')).toBeNull();
  });

  it('refuses a namespace that is not one OCI name component', () => {
    expect(slugProblem('')).toContain('A namespace is needed');
    expect(slugProblem('quay/quarkus')).toContain('Not a usable namespace');
    expect(slugProblem('-quay')).toContain('Not a usable namespace');
    expect(slugProblem('red-hat')).toBeNull();
    expect(slugProblem('ghcr.io')).toBeNull(); // a dot is legal inside a component
  });

  it('pre-empts the two clashes the loaded list can see, and only those', () => {
    // Re-registering the same pair is the idempotent request, not a clash.
    expect(clashProblem(registered, 'quay.io', 'quay')).toBeNull();

    expect(clashProblem(registered, 'quay.io', 'quarkus')).toContain('cannot be moved');
    expect(clashProblem(registered, 'ghcr.io', 'hub')).toContain('already mirrors docker.io');
    expect(clashProblem(registered, 'ghcr.io', 'ghcr')).toBeNull();
  });

  it('builds a prefix that reads as a prefix', () => {
    expect(pullPrefix('localhost:8081', 'quay')).toBe('localhost:8081/quay/');
  });
});
