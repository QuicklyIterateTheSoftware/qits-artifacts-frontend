# QitsPlatformSpaArtifacts

The artifact explorer: what this platform stores, what it costs, and — one repository at a time,
behind a plan — what it could stop storing. Served by qits-artifacts itself at the **root of its own
host** (`registry.<env>.<domain>`) through Quinoa. Eight pages, and almost all of it is read.

- **`/`** — every repository, with its type, how many things it holds, its own byte union and what
  cleaning it up would free, beside a store-level summary panel. Three requests, and none per
  repository.
- **`/repositories/<repo>`** — one repository, drawn as whatever its type holds: images, packages,
  Maven coordinates, daemons, documentation sites, or the CI record table.
- **`/repositories/<repo>/cleanup`** — what collecting that repository would delete, what it would
  keep and why each, and the one press in this application that deletes bytes.
- **`/repositories/<repo>/images/<image>`** — an image's tags and the manifest each points at, led
  by the per-image union.
- **`/repositories/<repo>/packages/<package>`** — a package's versions.
- **`/repositories/<repo>/maven-packages/<coordinate>`** — a coordinate's versions and the files
  each deploys.
- **`/repositories/<repo>/daemons/<daemon>`** — a daemon's published versions, each linked to its
  own version-addressed download, with the `sha256:` digest a deployment pins.
- **`/repositories/<repo>/docs/<site>`** — a documentation site's published versions, each with the
  branch and commit its publisher declared and a link that opens the bundle itself.

**Every one of them is addressable twice.** The platform's URL grammar puts the same page under
`/<projectSlug>/<group>/<repoName>/…` — the middle segment being the repository's component where
the platform gives it one and its archetype category where it does not — and the scoped form
resolves to the same component: `app.routes.ts` mounts one list of children under both, guarded on
the group. With a repository
in scope the front page leads with the image that repository publishes — `qits/<repoName>`, found
by filtering every registry in the store — above the whole-store table, and says plainly that the
name is a convention rather than a key.

Every in-app link goes through `ArtifactsLinks.commands(...)`, which prefixes the scope on screen,
and the one link out to qits-ci goes through `ArtifactsLinks.ciExplorer(...)`, which asks the
platform for that application's origin rather than spelling `/ci/`.

The pull-through caches are **not** here. They live in qits-platform-mirror, with their own admin
UI; this explorer covers what the platform hosts.

The tree is **repository-first**, and that is a decision rather than a default. Nothing in this
store joins to a project: not one column, in any table. An image name equals a git-host repository
id for the slug-named repositories, but it is derived by qits-cd from a deploy plan's application
name and merely coincides — and it coincides for no npm package at all. So the join is offered
where it is real: a tag shaped like a commit sha is a link out to the CI explorer, opened at the
repository of the same name, with the sha printed for you to match. It is not a link to a run.
qits-ci addresses a run by its own id and has no lookup from a commit, so a run URL would be one
this application invented.

**Every size here is a union, and the UI says which one.** Blobs are content-addressed and
deduplicated across every repository, so the same content measures 10.63 GiB added up per tag, 4.36
GiB added up per image and 4.04 GiB counted once. The headline size on an image is the **per-image
union**; the per-tag column is labelled *not additive* and is never totalled; and the summary panel
on the front page names all three figures, plus the ~124 MiB of orphaned blobs no row-based view can
show. An unlabelled byte count on a deduped store is a lie with a number in it.

The service still carries the cache figures on the wire and answers **0** for every one of them.
The panel draws none of them, on the same principle: a labelled zero reads as a fact about an empty
cache when it is a fact about a cache that is somewhere else.

**The cleanup figures are a fourth kind of byte count, and they do not add up either.** A
repository's cleanup figure is what cleaning *that repository alone* would free: the store-wide
reconciliation with only its dead identities applied and every other repository left standing. So a
blob two repositories both let go of is counted in neither of their figures and dies only in a
whole-store run — the column is a lower bound, never a total, and the table says so. A zero in it is
four different facts (not read yet, refused because the live pins were unreachable, nobody collects
this type, or a rule ran and found nothing), and the cell distinguishes all four rather than drawing
them alike.

**Nothing sweeps without its plan on screen.** The run lives only on the cleanup page, below the
rendered plan, and the repository list offers review rather than execution. That guarantees the
report was served and displayed before the invocation existed — it cannot prove anyone read it, and
does not claim to. When the service cannot read its live pins the run affordance is **not rendered
at all** rather than disabled, because what is on screen in that state is what the rules condemn
rather than what a run would take.

The **git host** is out of scope and named as such on the front page. It is a service of its own —
qits-githost, at `/git/` rather than under this segment — with its own storage: no blob store, no
rows, no repository entry here.

`src/app/api/` holds hand-written interfaces mirroring the service's wire shapes and one injectable
over `HttpClient` on the fetch backend — one upstream, because there is no second service to join
against. Nothing is generated: these routes are hidden from the OpenAPI document, and the platform
generates documents rather than clients.

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

`proxy.conf.json` forwards `/artifacts/api`, `/projects/api` and `/main-navigation` to the edge on
`localhost:8080`, because `ng serve` puts nothing in front. In a deployment every call is a
same-origin path on this service's own host, which the edge path-routes to whichever service owns
the prefix. These reads carry no credential in either case — the service's token filter covers write
methods only.

## Running the checks

```bash
npm run lint && npm test && npm run build
```

The same three, in the same order, are what `.config/qits/ci-post-receive.yml` runs on every push.
Note what that pipeline installs from: the npm registry behind it **is** qits-platform-artifacts, so
a run here cannot be green while that service is down. Its deploy is taken alone, with the CI queue
empty.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests with the [Vitest](https://vitest.dev/) test runner, use the following command:

```bash
ng test
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
