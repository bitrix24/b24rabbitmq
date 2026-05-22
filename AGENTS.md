# AGENTS.md

Guidance for AI coding agents (Claude Code, Cursor, Copilot, etc.) working in this repository. Humans: see [`CONTRIBUTING.md`](CONTRIBUTING.md). The roadmap and known defects live in [`PROJECT-BRIEF.md`](PROJECT-BRIEF.md) — it is the source of truth; this file is the operational guide.

> Load reference docs only when relevant — don't read everything up front. For testing details, open [`.github/contributing/testing.md`](.github/contributing/testing.md).

## Project overview

`@bitrix24/b24rabbitmq` is a small, dependency-light **ESM** TypeScript library that wraps [`amqplib`](https://github.com/amqp-node/amqplib) with config-driven `Producer`, `Consumer` and `RPC` primitives for integrating Bitrix24 applications with RabbitMQ. `amqplib` is a **peer** dependency; the only runtime dependency is `consola`. Build is ESM-only via `unbuild`.

The project is being reanimated (pre-`v0.1`). Several parts of the runtime code are **knowingly broken or incomplete** and scheduled for a test-first refactor — see [Known limitations](#known-limitations) before "fixing" something that looks wrong.

## Project structure

```
src/
├── index.ts      # public barrel — only what is exported here is public API
├── types.ts      # RabbitMQConfig, ExchangeParams, QueueParams, Message, MessageOptions, MessageHandler
├── base.ts       # RabbitMQBase: connect (overridable), setup/register exchanges & queues, disconnect
├── producer.ts   # RabbitMQProducer extends Base: initialize, connect, publish
├── consumer.ts   # RabbitMQConsumer extends Base: initialize, connect + reconnect, register/consume
├── rpc.ts        # RabbitRPC(producer, consumer): request/reply
└── tools/
    └── uuidv7.ts  # internal UUIDv7 generator (correlation ids) — NOT exported
tests/            # vitest specs, *.test.ts
tools/            # dev scripts (docs translation), not shipped
docs/en/          # English docs (terms + demos); docs/ru is generated & gitignored
```

## Commands

| Command | What it does |
|---|---|
| `pnpm install` | Install deps (pnpm 10.x, see `packageManager`) |
| `pnpm lint` / `pnpm lint:fix` | ESLint (also lints Markdown) |
| `pnpm typecheck` | `tsc --noEmit` (covers `src`, `tools`, `tests`, `*.config.ts`) |
| `pnpm test` | Run the vitest suite once |
| `pnpm test <pattern>` | Run only matching test files, e.g. `pnpm test uuidv7` |
| `pnpm exec vitest run <file> -t "<name>"` | Run a single test by name |
| `pnpm test:watch` | Vitest in watch mode |
| `pnpm test:coverage` | Vitest with v8 coverage report |
| `pnpm build` | Build ESM bundle + `.d.mts` via unbuild |
| `pnpm translate-docs` | Generate `docs/ru` from `docs/en` (needs `DEEPSEEK_API_KEY`) |

Before opening a PR, all four gates must pass locally: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`. CI runs them on every PR (tests on Node 20 **and** 22).

## Key conventions

- **Conventional Commits**, enforced by commitlint in CI on the PR title and every commit. Types: `feat`, `fix`, `refactor`, `docs`, `chore`, etc.
- **Branch off `main`** — never commit to it directly. Prefixes: `fix/*`, `feat/*`, `chore/*`, `docs/*`, `claude/*`. One logical change per PR.
- **ESM only.** No CommonJS. Use `import`/`export`, top-level `await` is fine in docs examples.
- **Keep the dependency surface minimal.** Don't add runtime deps; `amqplib` stays a peer dependency.
- **Logging goes through `consola`**, not `console.*`. (Existing `console.*` calls are a known defect being migrated — match the target, not the legacy.)
- **Public API = whatever `src/index.ts` re-exports.** Don't widen it casually; `tools/uuidv7.ts` is intentionally internal.
- **Docs are English** in `docs/en`; `docs/ru` is generated (gitignored), don't hand-edit it.

## Library source

The whole library is config-driven: one `RabbitMQConfig` object (connection, `exchanges[]`, `queues[]` with `bindings`/`maxPriority`/`deadLetter`, `channel.prefetchCount`) declares the topology. The class hierarchy:

- `RabbitMQBase` holds `connection`/`channel`, asserts exchanges and queues, and exposes `disconnect()`. `connect()` is **not** a TypeScript `abstract` method — it throws unless a subclass overrides it.
- `RabbitMQProducer` / `RabbitMQConsumer` each implement `connect()` and an `initialize()` that opens the connection then sets up topology. The Consumer additionally wires reconnect and `registerHandler`/`consume`.
- `RabbitRPC` composes a Producer + Consumer for request/reply over a `correlationId`.

Lifecycle to keep correct in code and docs: **construct → `initialize()` → (consumer) `registerHandler()` + `consume()` → (producer) `publish()`**. Re-publishing from inside a consumer handler must go through a `RabbitMQProducer` — a Consumer cannot publish.

### Known limitations

These are **intentionally not yet fixed**. Confirm against [`PROJECT-BRIEF.md`](PROJECT-BRIEF.md) (Phase 1) and fix them **test-first, one per PR** — don't bundle them into unrelated work:

1. **RPC doesn't work** — `RabbitRPC.call()` never calls `consumer.consume()` on its reply queue, and the correlation id is sent via AMQP `properties` but the consumer only surfaces the parsed JSON body to handlers.
2. **Unsafe consumer reconnect** — `throw` inside a `setTimeout` callback crashes the process; `connect()` is retried without `await`.
3. **`x-max-priority` lost** — `base.ts registerQueue` overwrites `arguments` when `deadLetter` is set instead of merging.
4. **`console.*` logging** — should be `consola`.
5. **`any` / missing JSDoc** on public methods and in `types.ts` / `rpc.ts`.

## Changing behavior

- **Test-first.** Behavioural change ships with a vitest test; when fixing a known bug, add a regression test that fails first. See [`.github/contributing/testing.md`](.github/contributing/testing.md).
- **Mock the broker.** Unit tests must not require a live RabbitMQ — mock the `amqplib` channel/connection. Don't add integration tests that hit a real broker to the default `pnpm test` run.
- **Time-dependent code** (uuidv7, reconnect backoff): use `vi.useFakeTimers()` / `vi.setSystemTime()` for determinism — never rely on real `setTimeout` or wall-clock ordering in assertions.
- **If you change `connect()`/`initialize()`/`publish()`/`consume()` semantics, update the examples** in `README.md` and `docs/en/demo/*` so they stay runnable.

## PR review checklist

- Commit messages and PR title follow Conventional Commits.
- Lint, typecheck, test, build all pass.
- New/changed behaviour has tests (broker mocked, timers faked where relevant).
- Public API change is intentional and reflected in `src/index.ts` + docs.
- Docs/examples updated if behaviour changed; `CHANGELOG.md` touched for user-facing changes.
- No new runtime dependency unless justified; `amqplib` stays a peer.

## Resources

- [`PROJECT-BRIEF.md`](PROJECT-BRIEF.md) — goal, stack, roadmap, known defects (source of truth)
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — runtime model and lifecycle
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — human contributor workflow
- [`.github/contributing/testing.md`](.github/contributing/testing.md) — testing conventions and recipes
