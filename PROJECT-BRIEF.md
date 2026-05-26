# @bitrix24/b24rabbitmq — Project Brief

> _Last reviewed: 2026-05-26._

> **Status**: reanimation, pre-v0.1. This document is the **single source of truth** for the plan. Issues, PR descriptions and `AGENTS.md` reference items here and add detail; they do not duplicate the plan.

## Goal

Ship a trustworthy **v0.1** of `@bitrix24/b24rabbitmq` — a small, dependency-light, config-driven TypeScript wrapper over [`amqplib`](https://github.com/amqp-node/amqplib) with `Producer` and `Consumer` primitives for integrating Bitrix24 applications (and any Node.js + RabbitMQ service) with sane defaults: reconnect, dead-letter, priority, declarative topology. ESM only. (Request/reply is intentionally out of scope for v0.1 — see Phase 1 #1.)

## Acceptance criteria for v0.1

The release is "trustworthy" when **all** are true:

- **Correctness**: zero known correctness defects with severity above *minor*; every exported public API works as documented; nothing exported that fails on first call.
- **Tests**: every exported class has at least characterization-level vitest coverage against a mocked `amqplib` channel; coverage threshold floor enforced in CI.
- **Logging**: `src/` contains zero stray `console.*`; all logging goes through an **injectable `Logger` interface** (default is a thin console adapter); consumers wire their own logger (e.g. `@bitrix24/b24jssdk`, `consola`, `pino`); AMQP URL credentials are not leaked to logs.
- **Docs**: README has a runnable Quickstart and a positioning paragraph for Bitrix24 integrators; `examples/` has at least two runnable end-to-end scenarios; `docs/en/` complete. English only at v0.1 — localization waits for a real user request.
- **Process**: release is tag-gated (not free `workflow_dispatch`); npm provenance shipped; CI matrix on Node 20 + 22; branch protection on `main`; commitlint on every PR.

## Critical path to v0.1

Sequenced view of what must land — and in roughly what order — for the acceptance criteria above to be met. Side tracks (skills, deployment recipes, additional capabilities) are deliberately **not** on this path.

1. **Track 1 Phase 1 correctness PRs** (one remaining item, see "The plan" below). **Phase 1 #7** is the last (already shipped: #3 in PR #10, #1 resolved-delete in PR #12, #4 in PR #13, #2 in PR #14, #5 in PR #15, #6 in PR #16). #7 ships with a regression test: a flipped Phase 0 characterisation lock for ack/nack idempotency.
2. **Track 2 Sprint C** — TypeDoc API reference, README badges. The public-API surface is now stable (Producer + Consumer), so Sprint C can land any time after Phase 1.
3. **Track 3 release flow** — adopt changesets/release-please, tag-triggered publish, branch protection. The last gate before tagging.
4. **Cut `v0.1`** on a green release pipeline.

Solo-maintainer + AI-assistant pace: roughly 6–8 sequential PRs from current `main` to the tag.

## Project coordinates

- **Repository**: https://github.com/bitrix24/b24rabbitmq
- **Package**: `@bitrix24/b24rabbitmq` (npm, public, MIT)
- **Module format**: ESM only (built with `unbuild`)
- **Peer dependency**: `amqplib` ^0.10
- **Reference process**: [`bitrix24/templates-mcp`](https://github.com/bitrix24/templates-mcp) — we mirror its CI, commitlint, renovate and test discipline (but not its Nuxt runtime; this is a plain library). The `skills/` directory there is MCP-agent-specific and intentionally not used here.

## Technology stack

| Layer | Choice | Rationale |
|---|---|---|
| Runtime | Node.js ^20 \|\| >=22 | Native `fetch`, ESM |
| Language | TypeScript 5.x (strict) | Type safety, declaration output |
| Broker client | `amqplib` ^0.10 (peer) | De-facto Node AMQP 0-9-1 client |
| Build | `unbuild` (rollup + esbuild) | ESM + `.d.mts`, banner injection |
| Lint | `eslint-config-unjs` | Matches Bitrix24 OSS conventions |
| Tests | `vitest` | Fast, ESM-native |
| Logging | Injectable `Logger` interface | Default = console adapter; consumers plug in their own (e.g. `b24jssdk`, `pino`, `consola`); no Bitrix24-specific runtime dependency forced on non-Bitrix24 consumers |

## Public API

```
src/
├── index.ts      # barrel: re-exports everything below
├── types.ts      # RabbitMQConfig, ExchangeParams, QueueParams, Message, MessageOptions, MessageHandler
├── base.ts       # RabbitMQBase: connect (throws unless overridden), setup/register exchanges & queues, disconnect
├── producer.ts   # RabbitMQProducer: initialize, connect, publish
└── consumer.ts   # RabbitMQConsumer: initialize, connect + reconnect, registerHandler, consume
```

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the runtime model.

---

# The plan

The work splits into four tracks. Each item carries: **what**, **why**, **acceptance criteria**, **status**, and (when relevant) the issue / PR it lives in. Sub-documents may clarify *how*, but never override what's written here.

## Track 1 — Correctness (gates v0.1)

### Phase 0: Reanimation

- [x] **Process foundation** — PR CI (lint + typecheck + test + build), commitlint, vitest scaffold, renovate, issue/PR templates, this brief. *(PR #1)*
- [x] **Dependency refresh** — bring devDeps to latest stable; drop unused runtime deps; clean Dependabot alerts. *(PR #4 added `@bitrix24/b24jssdk`; PR #5 reverted it in favour of an injectable `Logger` interface — see Phase 1 #5.)*
- [x] **Positioning brief & onboarding Sprint A/B safe items** — runnable `examples/`, README integrator section, keywords broadening, Demo 2 dual subtitle. *(PR #5)*
- [x] **Characterization tests** for `base` / `producer` / `consumer` against a mocked `amqplib` channel — see `tests/*.test.ts`. (Phase 0 originally also covered `rpc`; those tests were retired when RPC was dropped from v0.1 scope — see Phase 1 #1 below.)

### Phase 1: Correctness refactor

Test-first, one defect per PR.

**Recommended PR sequence (≠ list order below):** `#3 → #4 → #2 → #5 → #6 → #7`.
The merge fix (#3) shipped first as a low-risk warm-up that proved the
test-first flow on a real defect. **#1 (RPC) resolved as "delete"** —
out of v0.1 scope; the file and its tests are gone. The remainder, in order:
**#4** producer hygiene (mechanical, no public-API change) → **#2** reconnect
safety (isolated to `consumer.ts` but fixes a process-killing crash path —
touch is small, blast radius is large, hence not first) → **#5** logger DI
(architectural, adds a new public API surface) → **#6** typing/JSDoc polish
(no behavioural change) → **#7** consumer ack/nack idempotency (a
`consumer.ts` follow-up surfaced during characterisation; isolated and
well-bounded by the existing tests).

1. [x] **RPC: deleted from v0.1 scope.** *(Resolved 2026-05-25.)* The defect was verified end-to-end (reply queue never subscribed; AMQP `properties.correlationId` never reached handlers), but fixing it required an architectural change to `MessageHandler` (surface AMQP properties to handlers) for a primitive that no consumer was using yet. Dropped: `src/rpc.ts`, `src/tools/uuidv7.ts` (its only user), `tests/rpc.test.ts`, `tests/uuidv7.test.ts`. Issue #6 closed. If request/reply is needed later it returns as a separate package or a v0.2 feature, built on top of properties-aware handlers (a Track 4 capability, post-v0.1 — Phase 1 #5 is the logger DI, unrelated).
2. [x] **Consumer reconnect safety** *(PR #14)*. `handleReconnect` is now an awaitable async loop with a `reconnectInProgress` guard against concurrent runs; sleeps `reconnectInterval` between attempts; never throws (the old synchronous throw on max-retries-exceeded was an uncatchable crash path when triggered from the `'close'` event listener). On a successful reconnect the loop re-asserts the topology (`setupExchanges` + `setupQueues`) and re-subscribes every queue that had an active `consume()` call (tracked via a `subscribedQueues` set). `connect()` no longer special-cases ENOTFOUND/ECONNREFUSED — all errors propagate to the caller; reconnect is driven solely by the `'close'` event. Five new tests cover the recovery path, the no-throw-on-exhaustion behaviour, the concurrent-close guard, and the retries-reset-on-success invariant.
3. [x] **`base.ts registerQueue` — merge `x-max-priority` and dead-letter into one `arguments` object.** *(PR #10.)* Two compounding spread defects were characterised in PR #8/#9 and then flipped to assert the merge: `{arguments: {dlx}, ...assertsOptions}` had let the earlier `assertsOptions.arguments` overwrite dead-letter, and `{...assertsOptions, ...queue.options}` had let caller `options.arguments` wholesale-replace the merged result. PR #10 collapsed all three sources into one `mergedArguments` record, dropped the redundant top-level `maxPriority` field, and added a guard so `maxPriority: 0` no longer ships an invalid `x-max-priority: 0` to the broker. `examples/02-retry-dlq/rabbitmq.config.ts` migrated to the typed `deadLetter` field.
4. [x] **Producer hygiene** *(PR #13)*. `channel.prefetch()` was called inside `producer.connect()` — a consumer-side flow-control setting, no-op on a publish channel — and is removed. `publish()` carries a JSDoc block describing `amqplib`'s return-value semantics (channel buffer state, not broker ack) and pointing at publisher confirms (Track 4 capability) for at-least-once delivery. The commented-out "exchange not registered" guard was deleted along the way (decide-keep-or-drop landed on drop; the test that locked the lenient behaviour stays).
5. [x] **Logger migration via DI** *(PR #15)*. `Logger` interface exported from `src/types.ts` (`{ debug, info, warn, error }`, all required, shape-compatible with `console`, `pino`, `consola`, and the `@bitrix24/b24jssdk` logger). `RabbitMQConfig.logger` is an optional field; the default is a thin `console.*` wrapper (lives in the new `src/logger.ts`) so the library still writes diagnostics out of the box. Every diagnostic call site in `src/base.ts`, `src/producer.ts`, `src/consumer.ts` now goes through `this.logger.X` — `grep -r "console\." src/` now returns hits only inside `src/logger.ts` itself (the centralised default adapter). New `sanitizeUrl` / `safeErrorMessage` helpers scrub `amqp[s]://user:pass@host` credentials before any error message reaches the logger. Tests confirm a custom logger receives the calls and no password appears in captured log output.
6. [x] **Type tightening** *(PR #16)*. Every `any` in `src/types.ts` (and in the `MessageHandler` default type parameter) is now `unknown`: header bags, `Message.additionalData`, the `Message` open index signature, and `MessageHandler<T = unknown>`. The vestigial `[key: string]: any` index signature on `MessageOptions` was removed — `amqp.Options.Publish` already covers the typed publish fields and `unknown` was a footgun there. `grep -rn ": any" src/` returns no hits. Every public method on `RabbitMQBase`, `RabbitMQProducer`, `RabbitMQConsumer` now has a JSDoc block; every interface/type in `src/types.ts` is documented field-by-field — including the merge semantics of `QueueParams.arguments`, the publish back-pressure semantics, and the `ack`/`nack` contract on `MessageHandler`. One internal cast (`handler as MessageHandler` inside `registerHandler<T>`) is the deliberate type-system boundary where `T` is erased into the per-queue handler map; covered by a comment at the call site.
7. [ ] **Consumer ack/nack idempotency** (surfaced via characterisation in PR #9). The delivery callback now lives in `buildDeliveryCallback()` in `src/consumer.ts` (extracted in PR #14): it wraps the handler in `try/catch` and unconditionally `nack`s in the catch — so a handler that calls `ack()` and then throws causes BOTH `ack` and `nack` to fire on the same message, which `amqplib` rejects in production. Track the ack/nack state per delivery so only one terminal call is made.
   *Acceptance:* `tests/consumer.test.ts` characterisation "CURRENTLY calls both ack and nack when the handler ack()s and then throws" flips from asserting both calls to asserting only the explicit `ack`; a new test verifies that a handler which `nack()`s then throws also only nacks once.

## Track 2 — Onboarding & positioning

### Sprint A — perception & onboarding

- [x] **Runnable `examples/`** — `01-uniform-distribution` and `02-retry-dlq` linked from README. *(PR #5)*
- [x] **`package.json` keywords** broadened and lowercased. *(PR #5)*
- [x] **"Not only for Bitrix24" tagline** in README. *(PR #5)*
- [x] **"Known limitations" consolidated** into Track 1 Phase 1 above; `AGENTS.md` and `docs/ARCHITECTURE.md` now link back instead of duplicating the list.

### Sprint B — regional commitment

- [x] **"For Bitrix24 integrators" README section** — PHP→Node bridge, broker hosting table, TLS reminder. *(PR #5)*
- [x] **Demo 2 dual subtitle** "Balcony and Garden — Retry with Dead-Letter Queue (DLQ)" for SEO and clarity. *(PR #5)*
- ❄️ **Localized docs (RU / PT-BR)** — **frozen**. English is the v0.1 contract; localization waits for a real user request from a real integrator. Issues #3 (RU skill) and #7 (PT-BR mirror) closed as `not planned` until then.

### Sprint C — discoverability & API reference

- [ ] **TypeDoc API reference** under `docs/api/`, generated in CI on push to `main`.
  *Acceptance:* every public class / type has a generated page; link added to README Documentation section.
- [ ] **npm "downloads/week" + coverage badges** in README — once coverage thresholds are meaningful (i.e. after characterization tests land).

### Follow-up findings (consolidated from PR #5 multi-angle review)

Each item carries the same WHAT / WHY / ACCEPTANCE shape; addressed when the dependent Track 1 item lands or in the next docs PR.

- [x] **`examples/01-uniform-distribution/consumer.ts` catch path** — `ack()` replaced by `nack()` with a comment explaining why.
- [x] **`examples/02-retry-dlq/rabbitmq.config.ts`** switched to the typed `deadLetter` field once Track 1 #3 landed. *(PR #10.)*
- [ ] **`examples/*/package.json` missing** — `pnpm exec tsx` won't work without `pnpm init`.
  *Acceptance:* add a minimal `package.json` (`name`, `version`, `type: "module"`) to each example folder; rewrite README steps.
- [ ] **`examples/02-retry-dlq/dlq-drain.ts` — full `msg` logged** (potential PII).
  *Acceptance:* selective log of non-sensitive envelope fields + comment about PII risk.
- [ ] **README integrator section — `amqps://user:pass@host` URL form** advertises credentials in a string that current logging would leak.
  *Acceptance:* once Track 1 #5 lands, show a composed `{ hostname, username, password }` config form instead.
- [x] **`package.json` `keywords` — `rpc` removed** *(PR #10)*. Stays removed — Phase 1 #1 resolved as delete in PR #12.

## Track 3 — Process & infrastructure

Open as a working board in [issue #2](https://github.com/bitrix24/b24rabbitmq/issues/2) for discussion threads, but the canonical list is here.

- [x] **npm provenance** — `--provenance` + `id-token: write`. *(PR #4)*
- [x] **`tsconfig` cleanup** — frontend leftovers dropped. *(PR #4)*
- [ ] **Gated release flow** — adopt changesets / release-please (or assert `v*` tag matches `package.json` version); replace manual `workflow_dispatch` with tag-triggered publish.
  *Acceptance:* a wrong-tag publish attempt fails CI; `CHANGELOG.md` is generated, not hand-edited.
- [ ] **CI coverage upload** — Codecov or lcov artifact so PR-level coverage is visible.
- [ ] **Branch protection on `main`** — required status checks before merge (repo setting, not a file).
- [ ] **`.github/CODEOWNERS`**.
- [ ] **Issue Forms** — migrate `.github/ISSUE_TEMPLATE/*.md` to YAML forms with required fields.
- [ ] **renovate `rangeStrategy`** reconsidered — `bump` vs `update-lockfile` for a published library.
- [ ] **a11y for diagrams** — replace ASCII art in `docs/ARCHITECTURE.md` / this file with Mermaid.

## Track 4 — Capabilities (after v0.1)

- [ ] **Publisher confirms** option for `RabbitMQProducer`.
- [ ] **Graceful shutdown helpers** (SIGTERM hook that drains in-flight handlers before closing the channel).
- [ ] **PHP consumer/producer template** (README originally promised "PHP support soon").
- [ ] **Expand demos** beyond the two current scenarios (delayed retry / priority queues / fan-out).

## Track 5 — Skills for AI agents *(dormant — placeholder)*

**Status:** placeholder. The directory exists with a README + format, but no actual skills are committed and none are planned until a concrete trigger arrives. Listed here so the convention is discoverable, **not** as an active work-stream.

Skills are reusable, agent-readable recipes for repeatable workflows (translate docs, run all gates, regenerate examples, check for known antipatterns, etc.). They live in [`skills/`](skills/) at the repo root, in an agent-neutral Markdown format so any assistant (Claude Code, Cursor, Copilot, others) can pick them up. `.claude/skills/` may mirror entries for Claude-specific tooling — but the canonical source is `skills/`.

- [x] **Bootstrap the directory** — `skills/README.md` describes the format, naming, when to add a skill. *(PR #5)*
- [ ] **First real skill** — wait for a concrete trigger; do not pre-build skills no one is asking for.

## Track 6 — Deployment recipes *(post-v0.1; depends on Track 4)*

**Status:** the bootstrap baseline shipped in PR #5, but every meaningful follow-up item depends on **Track 4 graceful-shutdown helpers** and therefore lands after v0.1. Not on the v0.1 critical path.

The library itself does not deploy — `npm install` is the whole story. But integrators run **worker processes** on their own servers (VPS, Docker, Kubernetes, sometimes legacy Bitrix24 hosts). [`deployment/`](deployment/) holds copy-pasteable starting points.

- [x] **Bootstrap the directory** — `deployment/README.md` explains the scope; `Dockerfile.worker` and `docker-compose.yml` provide a working baseline (worker + RabbitMQ). *(PR #5)*
- [ ] **`systemd` unit example** — for VPS hosts without Docker (common in legacy Bitrix24 setups). *Post-v0.1.*
- [ ] **Kubernetes manifest example** — `Deployment` + `ConfigMap` + `Secret` skeleton with healthcheck and graceful-shutdown notes. *Blocked by Track 4 graceful-shutdown helpers.*
- [ ] **Operational notes** in `deployment/README.md` — SIGTERM handling, env-var-only credentials (never URL-form), reverse-proxy considerations, observability hooks. *Post-v0.1.*

---

## Non-functional requirements

- **License**: MIT
- **Module**: ESM only; no CommonJS unless a consumer needs it
- **Dependencies**: **no runtime dependencies** at v0.1 (`amqplib` is a peer). Logging is wired via DI — consumers plug in their own logger if they want one.
- **Tests**: every behavioural change ships with a vitest test; broker-touching logic uses a mocked `amqplib` channel.
- **Commits**: Conventional Commits, enforced by commitlint in CI.
- **Secrets**: never committed; never logged.
- **Docs**: English only at v0.1. Localization is gated on a real user request.

## Related artefacts

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — runtime model and lifecycle.
- [`AGENTS.md`](AGENTS.md) — operational guide for AI assistants.
- [`skills/`](skills/) — agent-readable workflow recipes (Track 5).
- [`deployment/`](deployment/) — deployment recipes for worker services (Track 6).
- Open issues: [#2](https://github.com/bitrix24/b24rabbitmq/issues/2) (Track 3 discussion board), [#11](https://github.com/bitrix24/b24rabbitmq/issues/11) (examples not type-checked).
