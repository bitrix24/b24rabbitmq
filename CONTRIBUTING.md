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
| `pnpm build` | Build ESM bundle + types via unbuild |

All of `lint`, `typecheck`, `test`, `build` run in CI on every PR. Run them locally before pushing.

> Using an AI coding assistant? Operational rules for agents live in [`AGENTS.md`](AGENTS.md).

## Tests

See [`.github/contributing/testing.md`](.github/contributing/testing.md) for conventions and recipes (mocking `amqplib`, fake timers, single-test runs).

- Tests live in `tests/**/*.test.ts` and run on [vitest](https://vitest.dev).
- Pure logic (e.g. `uuidv7`) is tested directly.
- Broker-touching code (`base`/`producer`/`consumer`/`rpc`) should be tested against a **mocked `amqplib` channel** — do not require a live RabbitMQ in unit tests.
- Every behavioural change ships with a test. When fixing a known bug, add a regression test that fails first.

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

## Where to start

See [`PROJECT-BRIEF.md`](PROJECT-BRIEF.md) for the roadmap and the list of known defects (Phase 1 correctness refactor), and [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the runtime model.
