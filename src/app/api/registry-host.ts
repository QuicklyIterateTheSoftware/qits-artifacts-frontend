import { InjectionToken } from '@angular/core';

/**
 * The host a `docker pull` through this registry is addressed to, and it is the reader's own host
 * on purpose.
 *
 * The Distribution API is served at `/v2` on the **host root** — docker resolves `<host>/<name>`
 * against `<host>/v2/` and accepts no path prefix — so the registry answers on whatever address
 * this explorer was reached on: the gateway at `:8080`, or qits-artifacts directly at `:8081`.
 * Printing `location.host` therefore prints a ref the reader can actually paste, rather than a
 * deployment constant this application would have had to invent and would get wrong the first time
 * anything moved.
 *
 * The platform's own Dockerfiles name `localhost:8081`, the direct address, because the build host
 * reaches the service without going through the gateway. Both are true refs for the same bytes;
 * the page says which one it is showing.
 *
 * A token rather than `location.host` read inline, for the reason {@link QITS_API_BASE} is one: a
 * spec needs a seam, and jsdom's host is an artefact of the test runner rather than a fact about
 * this platform.
 */
export const QITS_REGISTRY_HOST = new InjectionToken<string>('qits.registry-host', {
  providedIn: 'root',
  factory: () => location.host,
});
