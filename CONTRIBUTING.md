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
   _Failure mode if skipped:_ the `Publish 🚀` step fails with `npm error code ENEEDAUTH` (`npm error need auth You need to authorize this machine using \`npm adduser\``).
2. **Settings → Branches → Branch protection rules** for `main`:
   - Require a pull request before merging (1 approval minimum).
   - Require status checks to pass before merging — include every CI job: `Lint`, `Typecheck`, `Unit tests (node 20)`, `Unit tests (node 22)`, `Build`, `Commit messages`, `Docs (TypeDoc dry-run)`.
   - Require branches to be up to date before merging (forces PR rebases against a busy `main` — accept the cost, it prevents stale-branch regressions).
   _Failure mode if skipped:_ no error surface at all — contributors can push to `main` directly and PRs can land with red CI. Only detectable by reviewing `main` history.
3. **Settings → Actions → General → Workflow permissions** = `Read and write permissions` (so release-please can push commits to its release PR). Also enable `Allow GitHub Actions to create and approve pull requests`.
   _Failure mode if skipped:_ the `release-please` workflow logs `GitHub Actions is not permitted to create or approve pull requests` or `Resource not accessible by integration`.

### Known limitations of the default `GITHUB_TOKEN` for release-please

By GitHub's loop-prevention design, **a PR opened by `GITHUB_TOKEN` does not trigger other workflows.** So when release-please opens its release PR, the PR-time `ci.yml` jobs (`Lint` / `Typecheck` / `Unit tests` / `Build` / `Commit messages` / `Docs`) **do not auto-run on it**. Two consequences:

- The branch-protection "required status checks" list from step #2 will block merging the release PR (checks never ran, so they're stuck in `pending`).
- To unblock, either (a) push an empty commit to the release branch (`git commit --allow-empty -m "chore: trigger ci"` then `git push`), (b) close + reopen the release PR, or (c) wire a Personal Access Token / GitHub App token via `secrets.RELEASE_PLEASE_TOKEN` and pass it to the action — that lets the PR be opened by an identity GitHub treats as a "real" user, which does trigger downstream workflows.

The defense-in-depth here is that `npm-publish.yml` re-runs every gate before publishing, so a broken release PR cannot ship to npm even if it merges. Option (c) is the cleanest long-term answer; (a) is the cheapest stopgap.

### First-run recovery — release-please bootstrap

The very first release-please run after this flow lands scans the **entire** commit history for Conventional Commits (no `bootstrap-sha` is configured). For our repo that surfaces every PR back to genesis, which may produce a busier-than-expected `## [0.1.0]` CHANGELOG block. If the first release PR looks wrong:

1. **Close** the PR (don't merge).
2. Add `"bootstrap-sha": "<sha-of-last-released-commit>"` to `.github/release-please-config.json` under the `"."` package.
3. Push to `main`; release-please will re-run and propose a clean release PR starting from that SHA.

There is **no risk of accidental publish during recovery** — `.github/workflows/npm-publish.yml` is gated on `release: types: [published]`, which only fires after the release PR is merged and the GitHub Release is created.

### CHANGELOG reconciliation on the first auto-release

`CHANGELOG.md` currently has a hand-written `## Unreleased` block listing PRs #10–#19 with rich per-entry context. release-please does not know about that block; it will insert a new `## [0.1.0]` heading **above** it with auto-generated entries derived from commit subjects (shorter, less context). **Expect to reconcile the first release PR's CHANGELOG manually** — typically: keep release-please's `## [0.1.0]` heading + date, replace its body with the hand-written content from `## Unreleased`, then delete the now-empty `## Unreleased`. Subsequent releases won't need this reconciliation because the hand-written approach ends with v0.1.

## Where to start

See [`PROJECT-BRIEF.md`](PROJECT-BRIEF.md) for the roadmap and the list of known defects (Phase 1 correctness refactor), and [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the runtime model.
