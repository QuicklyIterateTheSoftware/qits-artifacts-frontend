import type { MirrorUpstreamDto } from '../api/dto';

/**
 * The rules an upstream registration has to satisfy, restated on the client so a bad value is
 * caught before it costs a round trip.
 *
 * They are restated **exactly**, and that is the only version of this idea worth shipping: a
 * client rule that is merely similar to the server's is worse than no rule at all, because it
 * either refuses a value the service would have accepted or promises one it is about to refuse.
 * Both patterns below are transcriptions of the service's own — `OciMirrorUpstreams.DOMAIN` and
 * the Distribution spec's name-component grammar that `OciImageName.isComponent` applies — and the
 * two normalisations are its `requireDomain`/`requireSlug` word for word.
 *
 * **The two fields are normalised differently, and the difference is a trap worth surfacing.** The
 * domain is trimmed *and lowercased* for you, so `Quay.IO ` registers `quay.io`. The slug is only
 * trimmed: `Quay` is refused rather than folded to `quay`, because a namespace is the first path
 * segment of a pull and the Distribution grammar has no uppercase in it. The form shows what will
 * actually be sent so neither is a surprise.
 *
 * What is deliberately **not** checked here: whether the slug collides with a repository of some
 * other type. This page reads the upstream list and nothing else — a repository named `npm` is
 * invisible to it — so pre-empting that clash would mean either a second request on every page
 * load or a guess. The service answers it in one sentence, and the form shows that sentence.
 */

/**
 * A registry domain: dot-separated lowercase labels, optionally with a port. At least one dot,
 * which is what makes `localhost` fail here — deliberately, since a bare hostname is not something
 * the miss path can dial from inside a container.
 */
const DOMAIN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+(:\d{1,5})?$/;

/** One legal OCI name component — the whole of what a namespace is allowed to be. */
const SLUG = /^[a-z0-9]+(?:(?:[._]|__|-+)[a-z0-9]+)*$/;

/** The domain as the service will store it: trimmed and lowercased. */
export function cleanDomain(raw: string): string {
  return raw.trim().toLowerCase();
}

/** The slug as the service will store it: trimmed, and **not** lowercased. */
export function cleanSlug(raw: string): string {
  return raw.trim();
}

/** What is wrong with this domain, in one sentence, or null when nothing is. */
export function domainProblem(raw: string): string | null {
  const clean = cleanDomain(raw);
  if (clean === '') {
    return 'A domain is needed — this is the registry the cache will dial on a miss.';
  }
  if (!DOMAIN.test(clean)) {
    return 'Not a registry domain. Dot-separated labels and an optional port, like quay.io or registry.access.redhat.com:443.';
  }
  return null;
}

/** What is wrong with this namespace, in one sentence, or null when nothing is. */
export function slugProblem(raw: string): string | null {
  const clean = cleanSlug(raw);
  if (clean === '') {
    return 'A namespace is needed — it becomes the first path segment of every pull through this upstream.';
  }
  if (!SLUG.test(clean)) {
    return 'Not a usable namespace. One lowercase OCI name component: letters and digits, with single dots, underscores or dashes between them.';
  }
  return null;
}

/**
 * The clash this page can see, in the service's own terms, or null.
 *
 * Two of the service's three 400s are visible from the loaded list, so the form can say them
 * before sending: a domain already mirrored under a *different* namespace, and a namespace already
 * taken by another domain. The same domain and the same namespace is not a clash at all — that
 * request is the idempotent one and it answers 200.
 */
export function clashProblem(
  upstreams: readonly MirrorUpstreamDto[],
  rawDomain: string,
  rawSlug: string,
): string | null {
  const domain = cleanDomain(rawDomain);
  const slug = cleanSlug(rawSlug);

  const sameDomain = upstreams.find((upstream) => upstream.domain === domain);
  if (sameDomain && sameDomain.slug !== slug) {
    return (
      `${domain} is already mirrored at “${sameDomain.slug}”, and a namespace cannot be moved: ` +
      'content is cached under the old one. Remove it and register it again to change the name.'
    );
  }

  const sameSlug = upstreams.find((upstream) => upstream.slug === slug);
  if (sameSlug && sameSlug.domain !== domain) {
    return `The namespace “${slug}” already mirrors ${sameSlug.domain}.`;
  }

  return null;
}

/**
 * The ref prefix a pull through this namespace carries — `localhost:8081/quay/`.
 *
 * The trailing slash is there because the prefix is never the whole ref: the upstream's own image
 * path follows it, so what a Dockerfile ends up naming is
 * `localhost:8081/quay/quarkus/ubi9-quarkus-mandrel-builder-image:jdk-25`. Printing the prefix
 * without the slash would read as a complete name and it is not one.
 */
export function pullPrefix(host: string, slug: string): string {
  return `${host}/${slug}/`;
}
