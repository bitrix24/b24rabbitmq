# AGENTS.md

> _Last reviewed: 2026-05-25._

Guidance for AI coding agents (Claude Code, Cursor, Copilot, etc.) working in this repository. Humans: see [`CONTRIBUTING.md`](CONTRIBUTING.md). The roadmap and known defects live in [`PROJECT-BRIEF.md`](PROJECT-BRIEF.md) — it is the source of truth; this file is the operational guide.

> Load reference docs only when relevant — don't read everything up front. For testing details, open [`.github/contributing/testing.md`](.github/contributing/testing.md).

## Project overview

`@bitrix24/b24rabbitmq` is a small, dependency-light **ESM** TypeScript library that wraps [`amqplib`](https://github.com/amqp-node/amqplib) with config-driven `Producer` and `Consumer` primitives for integrating Bitrix24 applications (or any Node.js service) with RabbitMQ. `amqplib` is a **peer** dependency; there are no runtime dependencies. Logging is wired via DI — consumers pass their own `Logger` if they want one. Build is ESM-only via `unbuild`. **No RPC / request-reply primitive** at v0.1 — see `PROJECT-BRIEF.md` Phase 1 #1 for rationale; build it on top of Producer + Consumer if you need it, or wait for v0.2.

The project is being reanimated (pre-`v0.1`). A handful of remaining items (logger DI, typing polish, ack/nack idempotency) are scheduled for a test-first refactor — see [Known limitations](#known-limitations) before "fixing" something that looks wrong.

## Project structure

```
src/
├── index.ts      # public barrel — only what is exported here is public API
├── types.ts      # RabbitMQConfig, ExchangeParams, QueueParams, Message, MessageOptions, MessageHandler
├── base.ts       # RabbitMQBase: connect (overridable), setup/register exchanges & queues, disconnect
├── producer.ts   # RabbitMQProducer extends Base: initialize, connect, publish
└── consumer.ts   # RabbitMQConsumer extends Base: initialize, connect + reconnect, register/consume
tests/            # vitest specs, *.test.ts
docs/en/          # English docs (terms + demos) — English only at v0.1
skills/           # agent-readable workflow recipes (translate-docs, run-gates, ...)
deployment/       # deployment recipes for worker services that use this library
```

## Commands

| Command | What it does |
|---|---|
| `pnpm install` | Install deps (pnpm 10.x, see `packageManager`) |
| `pnpm lint` / `pnpm lint:fix` | ESLint (also lints Markdown) |
| `pnpm typecheck` | `tsc --noEmit` (covers `src`, `tools`, `tests`, `*.config.ts`) |
| `pnpm test` | Run the vitest suite once |
| `pnpm test <pattern>` | Run only matching test files, e.g. `pnpm test consumer` |
| `pnpm exec vitest run <file> -t "<name>"` | Run a single test by name |
| `pnpm test:watch` | Vitest in watch mode |
| `pnpm test:coverage` | Vitest with v8 coverage report |
| `pnpm build` | Build ESM bundle + `.d.mts` via unbuild |

Before opening a PR, all four gates must pass locally: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`. CI runs them on every PR (tests on Node 20 **and** 22).

## Key conventions

- **Conventional Commits**, enforced by commitlint in CI on the PR title and every commit. Types: `feat`, `fix`, `refactor`, `docs`, `chore`, etc.
- **Branch off `main`** — never commit to it directly. Prefixes: `fix/*`, `feat/*`, `chore/*`, `docs/*`, `claude/*`. One logical change per PR.
- **ESM only.** No CommonJS. Use `import`/`export`, top-level `await` is fine in docs examples.
- **Keep the dependency surface minimal.** Don't add runtime deps; `amqplib` stays a peer dependency.
- **Logging is dependency-injected** via the `Logger` interface in `src/types.ts` (shape-compatible with `console`, `pino`, `consola`, `@bitrix24/b24jssdk`). Default is a thin `console.*` wrapper in `src/logger.ts`. `RabbitMQConfig.logger` accepts a custom logger. Every diagnostic in `src/` routes through `this.logger.X`; the only `console.*` calls live inside `src/logger.ts` as the default adapter. `sanitizeUrl` / `safeErrorMessage` (from `src/logger.ts`) scrub `amqp[s]://user:pass@host` credentials before any error message reaches the logger — use them whenever a caught error is logged.
- **Public API = whatever `src/index.ts` re-exports.** Don't widen it casually. `RabbitRPC` was dropped from v0.1 scope — see `PROJECT-BRIEF.md` Phase 1 #1.
- **Docs are English only** at v0.1; localization is frozen until a real integrator asks.

## Library source

The whole library is config-driven: one `RabbitMQConfig` object (connection, `exchanges[]`, `queues[]` with `bindings`/`maxPriority`/`deadLetter`, `channel.prefetchCount`) declares the topology. The class hierarchy:

- `RabbitMQBase` holds `connection`/`channel`, asserts exchanges and queues, and exposes `disconnect()`. `connect()` is **not** a TypeScript `abstract` method — it throws unless a subclass overrides it.
- `RabbitMQProducer` / `RabbitMQConsumer` each implement `connect()` and an `initialize()` that opens the connection then sets up topology. The Consumer additionally wires a bounded async reconnect loop on the connection's `'close'` event — on recovery it re-asserts the topology and re-subscribes every queue that had an active `consume()` — and `registerHandler` / `consume`. `RabbitMQConsumer.disconnect()` overrides the base to clear the reconnect-tracking state so an instance can be re-initialised cleanly.

Lifecycle to keep correct in code and docs: **construct → `initialize()` → (consumer) `registerHandler()` + `consume()` → (producer) `publish()`**. Re-publishing from inside a consumer handler must go through a `RabbitMQProducer` — a Consumer cannot publish.

### Known limitations

The canonical list lives in [`PROJECT-BRIEF.md`](PROJECT-BRIEF.md) under **Track 1 — Phase 1**. Confirm against it before "fixing" something that looks wrong; fix items **test-first, one per PR**.

## Changing behavior

- **Test-first.** Behavioural change ships with a vitest test; when fixing a known bug, add a regression test that fails first. See [`.github/contributing/testing.md`](.github/contributing/testing.md).
- **Mock the broker.** Unit tests must not require a live RabbitMQ — use the shared factory at [`tests/_helpers/amqp-mock.ts`](tests/_helpers/amqp-mock.ts) (`makeFakeChannel`, `makeFakeConnection`, `getConsumeCallback`); see [the testing guide](.github/contributing/testing.md#mocking-amqplib) for usage. Don't inline your own spies. Don't add integration tests that hit a real broker to the default `pnpm test` run.
- **Time-dependent code** (reconnect backoff and any future timers): use `vi.useFakeTimers()` / `vi.setSystemTime()` for determinism — never rely on real `setTimeout` or wall-clock ordering in assertions.
- **If you change `connect()`/`initialize()`/`publish()`/`consume()` semantics, update the examples** in `README.md` and `docs/en/demo/*` so they stay runnable.

## PR review checklist

- Commit messages and PR title follow Conventional Commits.
- Lint, typecheck, test, build all pass.
- New/changed behaviour has tests (broker mocked, timers faked where relevant).
- Public API change is intentional and reflected in `src/index.ts` + docs.
- Docs/examples updated if behaviour changed; `CHANGELOG.md` touched for user-facing changes.
- No new runtime dependency unless justified; `amqplib` stays a peer.
- **For any removal or signature change to a public export** (pre-v0.1 has no SemVer commitment, but still): verify known downstream consumers — currently [`bitrix24/app-template-automation-rules`](https://github.com/bitrix24/app-template-automation-rules) — are unaffected; note the result in the PR description.
- **Any new diagnostic in `src/` goes through `this.logger.X`**, not `console.*`. `grep -r "console\." src/` must return hits only inside `src/logger.ts` (the default adapter). Error messages from caught exceptions go through `safeErrorMessage` from `src/logger.ts` to scrub `amqp[s]://user:pass@host` credentials.

## Resources

- [`PROJECT-BRIEF.md`](PROJECT-BRIEF.md) — goal, stack, roadmap, known defects (source of truth)
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — runtime model and lifecycle
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — human contributor workflow
- [`.github/contributing/testing.md`](.github/contributing/testing.md) — testing conventions and recipes
