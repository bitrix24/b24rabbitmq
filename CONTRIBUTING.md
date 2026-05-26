# Contributing

Thanks for helping reanimate `@bitrix24/b24rabbitmq`. This guide covers the local workflow and the conventions CI enforces.

## Prerequisites

- Node.js `^20 || >=22`
- [pnpm](https://pnpm.io) `10.x` (the repo pins `packageManager`)

## Setup

```bash
pnpm install
```

## Everyday commands

| Command | What it does |
|---|---|
| `pnpm lint` | ESLint over the repo |
| `pnpm lint:fix` | ESLint with autofix |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm test` | Run the vitest suite once |
| `pnpm test:watch` | Vitest in watch mode |
| `pnpm test:coverage` | Vitest with a v8 coverage report |
| `pnpm build` | Build ESM bundle + types via unbuild |
| `pnpm docs:build` | Generate the TypeDoc API reference into `docs/api/` (dry-run also gates each PR). **Not `pnpm docs`** — that's a pnpm built-in command that opens the package's homepage URL. |
| `pnpm docs:watch` | TypeDoc in watch mode for local docs iteration |

All of `lint`, `typecheck`, `test`, `build`, `docs:build` run in CI on every PR. Run them locally before pushing.

> Using an AI coding assistant? Operational rules for agents live in [`AGENTS.md`](AGENTS.md).

## Tests

See [`.github/contributing/testing.md`](.github/contributing/testing.md) for conventions and recipes (mocking `amqplib`, fake timers, single-test runs).

- Tests live in `tests/**/*.test.ts` and run on [vitest](https://vitest.dev).
- Pure logic is tested directly.
- Broker-touching code (`base`/`producer`/`consumer`) should be tested against a **mocked `amqplib` channel** — do not require a live RabbitMQ in unit tests.
- Every behavioural change ships with a test. When fixing a known bug, add a regression test that fails first.
- **Phase 1 correctness fixes** (see [`PROJECT-BRIEF.md`](PROJECT-BRIEF.md)) must land **after** the characterization tests that lock current behaviour — open/merge those first so the refactor has a baseline.

## Branches

Never commit directly to `main`. Branch off it using one of these prefixes:

- `fix/*` — bug fixes
- `feat/*` — new features
- `chore/*` / `docs/*` — tooling, deps, documentation
- `claude/*` — AI-assisted work

Open a PR back into `main`; CI must be green before merge.

## Commit & PR conventions

- Commits and PR titles follow [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `refactor:`, `docs:`, `chore:`, …). `commitlint` enforces this in CI.
- One logical change per PR. Keep the public API minimal.
- Update `CHANGELOG.md` and docs when behaviour changes.

## Release flow (maintainers)

Releases are automated via [release-please](https://github.com/googleapis/release-please):

1. Every push to `main` runs `.github/workflows/release-please.yml`, which opens (or updates) a single **"release-please" PR** with the next version bump (computed from Conventional Commits since the previous tag) plus the relevant CHANGELOG entries under a new `## [x.y.z]` header.
2. **Review the release PR like any other PR.** When it's ready, merge it (squash, like everything else).
3. release-please then creates the git tag (`v<x.y.z>`) and a matching GitHub Release.
4. `.github/workflows/npm-publish.yml` listens for `release: types: [published]`, re-runs every gate (lint / typecheck / test:coverage / build / docs:build), and publishes to npm with `--provenance`.

A `workflow_dispatch` trigger on `npm-publish.yml` remains as a manual fallback for hotfix scenarios outside the release-please flow.

### One-time maintainer setup

These have to be done **once** by a repo admin and persist:

1. **Secrets → `NPM_AUTH_TOKEN`** — npm automation token with `Publish` scope for `@bitrix24/b24rabbitmq`. Required by the publish workflow.
2. **Settings → Branches → Branch protection rules** for `main`:
   - Require a pull request before merging (1 approval minimum).
   - Require status checks to pass before merging — include every CI job: `Lint`, `Typecheck`, `Unit tests (node 20)`, `Unit tests (node 22)`, `Build`, `Commit messages`, `Docs (TypeDoc dry-run)`.
   - Require branches to be up to date before merging.
3. **Settings → Actions → General → Workflow permissions** = `Read and write permissions` (so release-please can push commits to its release PR). Also enable `Allow GitHub Actions to create and approve pull requests`.

Without #1 the publish step fails with a clear npm error. Without #2 there is no guard against direct pushes to `main`. Without #3 release-please cannot open or update its release PR.

## Where to start

See [`PROJECT-BRIEF.md`](PROJECT-BRIEF.md) for the roadmap and the list of known defects (Phase 1 correctness refactor), and [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the runtime model.
