/**
 * The small conversions the pages need, kept out of the templates so they can be asserted
 * directly.
 *
 * Two of them carry the weight of this whole application.
 *
 * **`formatBytes` always prints a unit.** The store deduplicates globally, so its byte counts do
 * not add up and a bare number invites exactly the addition that is wrong. A figure with `GiB` on
 * it can at least be read; the *kind* of figure it is — union, per-image, per-tag — is the
 * template's job to say beside it, and every template here does.
 *
 * **`isCommitSha` is a guess, and it is labelled as one wherever it is used.** `oci_tag.tag` is
 * undeclared: nothing in the schema says a tag is a commit, the platform's images simply tag that
 * way. So the test is on the shape of the string and nothing else.
 *
 * Every timestamp is rendered in **UTC**, as in spa-ci and spa-cd: the services stamp `Instant`s,
 * and a browser-local rendering would make two people looking at the same manifest disagree about
 * when it was pushed.
 */

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

/** What is drawn where there is nothing to draw — one em dash, everywhere. */
export const NONE = '—';

/**
 * What is drawn for a size the service could not measure. Different from {@link NONE} on purpose:
 * "not measured" and "nothing there" are different facts, and a null size on an npm version that
 * was indexed but never pulled is the first, not the second.
 */
export const UNKNOWN_SIZE = 'not measured';

function parse(iso: string | null | undefined): Date | null {
  if (!iso) {
    return null;
  }
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

function pad(value: number): string {
  return value.toString().padStart(2, '0');
}

/** `31 Jul 14:02` — a table row's timestamp, no year. */
export function formatDayTime(iso: string | null): string {
  const date = parse(iso);
  if (!date) {
    return NONE;
  }
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}

/** `31 Jul 2026 14:02:11Z` — where the exact instant matters and the year is not obvious. */
export function formatInstant(iso: string | null): string {
  const date = parse(iso);
  if (!date) {
    return NONE;
  }
  return (
    `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()} ` +
    `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}Z`
  );
}

const UNITS = ['B', 'KiB', 'MiB', 'GiB', 'TiB'] as const;

/**
 * `4.04 GiB`, `164 MiB`, `85.0 KiB`, `0 B` — binary units, because that is what every measurement
 * behind this UI was taken in, and because a store reported in GB against a plan written in GiB is
 * a 7% argument nobody needs.
 *
 * Null is `not measured` rather than `0 B`. Three significant figures throughout, and bytes are
 * printed whole: `1023 B` is exact, and `1.00 KiB` would round it into a lie.
 */
export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) {
    return UNKNOWN_SIZE;
  }
  if (bytes < 1024) {
    return `${Math.round(bytes)} B`;
  }
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const decimals = value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(decimals)} ${UNITS[unit]}`;
}

/** `10 images`, `1 image` — a count is never drawn without the noun it counts. */
export function plural(count: number, singular: string, pluralForm?: string): string {
  return `${count} ${count === 1 ? singular : (pluralForm ?? `${singular}s`)}`;
}

/**
 * What a repository of this type holds, as a word. The six archetypes count different things and
 * a column headed "items" would hide that; `itemCount` is images here, packages there, deployed
 * files for maven, published versions for the daemons, and records for the two ci types that have
 * never held one.
 */
export function itemNoun(type: string): string {
  switch (type) {
    case 'oci-images':
      return 'image';
    case 'npm-packages':
      return 'package';
    // A maven version is a SET of files — a jar, a pom, their checksums — so the count is files
    // and not versions. Calling them versions would overstate the store by a factor of four.
    case 'maven-packages':
      return 'file';
    case 'daemon-binaries':
      return 'version';
    default:
      return 'record';
  }
}

/**
 * A tag that looks like a git commit — full 40-hex, or one of the abbreviations git itself hands
 * out. qits-observability carries both forms, which is the reason for the range rather than an
 * exact length.
 *
 * Seven is git's own floor for an abbreviation, and it is the floor here too. It is still only a
 * shape test: `1234567` is a plausible version string as well as a plausible sha, so what this
 * enables in the UI is an offer to go looking, never a claim that a run exists.
 */
const COMMIT_SHA = /^[0-9a-f]{7,40}$/;

export function isCommitSha(tag: string): boolean {
  return COMMIT_SHA.test(tag);
}

/** The first seven characters of a sha, as git itself abbreviates. Shorter tags are left alone. */
export function shortSha(sha: string): string {
  return sha.length > 7 ? sha.slice(0, 7) : sha;
}

/** `sha256:ab12cd…` — a digest, short enough for a table cell and still recognisable. */
export function shortDigest(digest: string): string {
  const [algorithm, hex] = digest.split(':');
  return hex ? `${algorithm}:${hex.slice(0, 12)}` : digest.slice(0, 19);
}
