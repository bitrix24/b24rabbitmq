# @bitrix24/b24rabbitmq — Project Brief

> **Status**: reanimation, pre-v0.1. This document is the **single source of truth** for the plan. Issues, PR descriptions and `AGENTS.md` reference items here and add detail; they do not duplicate the plan.

## Goal

Ship a trustworthy **v0.1** of `@bitrix24/b24rabbitmq` — a small, dependency-light, config-driven TypeScript wrapper over [`amqplib`](https://github.com/amqp-node/amqplib) with `Producer`, `Consumer` and `RPC` primitives for integrating Bitrix24 applications (and any Node.js + RabbitMQ service) with sane defaults: reconnect, dead-letter, priority, declarative topology. ESM only.

## Acceptance criteria for v0.1

The release is "trustworthy" when **all** are true:

- **Correctness**: zero known correctness defects with severity above *minor*; every exported public API works as documented; nothing exported that fails on first call.
- **Tests**: every exported class has at least characterization-level vitest coverage against a mocked `amqplib` channel; uuidv7 stays at ~100%; coverage threshold floor enforced in CI.
- **Logging**: `src/` contains zero stray `console.*`; all logging goes through an **injectable `Logger` interface** (default is a thin console adapter); consumers wire their own logger (e.g. `@bitrix24/b24jssdk`, `consola`, `pino`); AMQP URL credentials are not leaked to logs.
- **Docs**: README has a runnable Quickstart and a positioning paragraph for Bitrix24 integrators; `examples/` has at least two runnable end-to-end scenarios; `docs/en/` complete. English only at v0.1 — localization waits for a real user request.
- **Process**: release is tag-gated (not free `workflow_dispatch`); npm provenance shipped; CI matrix on Node 20 + 22; branch protection on `main`; commitlint on every PR.

## Critical path to v0.1

Sequenced view of what must land — and in roughly what order — for the acceptance criteria above to be met. Side tracks (skills, deployment recipes, additional capabilities) are deliberately **not** on this path.

1. **Track 1 Phase 1 correctness PRs** (six items, see "The plan" below). Approximate order: `#3 → #1 → #4 → #2 → #5 → #6`. Each PR ships with a regression test that flips a Phase 0 characterisation lock.
2. **Track 2 Sprint C** — TypeDoc API reference, README badges. Depends on the public-API shape stabilising, so it follows the RPC decision (Phase 1 #1).
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
| Runtime | Node.js ^20 \|\| >=22 | Native `fetch`, ESM, BigInt for uuidv7 |
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
├── consumer.ts   # RabbitMQConsumer: initialize, connect + reconnect, registerHandler, consume
├── rpc.ts        # RabbitRPC: request/reply over a producer + consumer pair
└── tools/
    └── uuidv7.ts # internal: dependency-free UUIDv7 generator for RPC correlation ids (not part of the public exports)
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
- [x] **Characterization tests** for `base` / `producer` / `consumer` / `rpc` against a mocked `amqplib` channel. 32 tests across 5 files; coverage 26.77% → **87.4% statements / 90% functions**. Two defects (RPC reply queue never consumed; AMQP properties not surfaced to handlers) now have executable proof — see `tests/rpc.test.ts` and `tests/consumer.test.ts`.

### Phase 1: Correctness refactor

Test-first, one defect per PR.

**Recommended PR sequence (≠ list order below):** `#3 → #1 → #4 → #2 → #5 → #6`.
The merge fix (#3) ships first as a low-risk warm-up that proves the test-first
flow on a real defect. **RPC (#1) comes second** — its outcome (fix vs. delete)
shapes the public API surface and therefore Track 2 Sprint C scope (TypeDoc,
re-export decision); leaving it for last would shadow every intermediate PR
with an open question. The rest ascend in risk: producer hygiene (#4) → the
process-killing reconnect (#2) → the architectural logger DI (#5) → typing
polish (#6).

1. [ ] **RPC: fix or delete** — *issue #6*. **Verification done** (PR for characterization tests): `tests/rpc.test.ts` proves the defect end-to-end. Concrete failure mode:
   - `RabbitRPC.call()` asserts the reply queue via `consumer.registerQueue` but **never calls `consumer.consume()` on it**, so the channel has no active subscription for replies (`src/rpc.ts:19–28`).
   - Even if it did, the consumer's delivery callback passes only `JSON.parse(msg.content)` to handlers — AMQP `properties.correlationId` is invisible — so the `msg.correlationId === correlationId` comparison at `src/rpc.ts:40` always fails.
   *Next:* decide between **(a) fix** (call `consumer.consume()` on the reply queue, surface AMQP properties to handlers — either as a second arg or by passing the wrapped message); or **(b) delete `src/rpc.ts`** and drop RPC from v0.1 scope.
2. [ ] **Consumer reconnect safety** — `throw` inside `setTimeout` crashes the process; `this.connect()` is not awaited.
   *Acceptance:* bounded async backoff loop; handlers re-established after reconnect; vitest simulates connection drop and asserts recovery.
3. [ ] **`base.ts registerQueue` — merge `x-max-priority` and dead-letter into one `arguments` object.** **Characterised** by `tests/base.test.ts` (the "LOSES dead-letter arguments…" test): when both `maxPriority` and `deadLetter` are set, the spread `{arguments: {dlx}, ...assertsOptions}` lets `assertsOptions.arguments` (carrying `x-max-priority`) overwrite the dead-letter arguments, so **dead-letter is dropped, not priority** — opposite of what the original `// @todo fix this` comment implies. A second related vector (`queue.options.arguments` from the caller also overwrites everything) is locked by a sibling test.
   *Acceptance:* a queue declared with both `maxPriority` and `deadLetter` passes **both** `x-max-priority` and the `x-dead-letter-*` keys through to `channel.assertQueue.arguments`; caller-supplied `queue.options.arguments` are merged into the result rather than replacing it. The two characterisation tests flip from asserting the loss to asserting the merge. **Also update `examples/02-retry-dlq/rabbitmq.config.ts`** to use the typed `deadLetter` field (it currently uses raw `options.arguments` to dodge the bug).
4. [ ] **Producer hygiene** — remove `channel.prefetch` from the publish channel (meaningless there); decide on publisher confirms so `publish()`'s boolean return is trustworthy.
   *Acceptance:* `producer.connect()` does not call `prefetch`; `publish()` JSDoc documents return-value semantics.
5. [ ] **Logger migration via DI** — replace stray `console.*` with calls to an injected `Logger` interface (`{ info, warn, error, debug }`); add a tiny default console adapter so the library still works out of the box.
   *Why:* avoids forcing a Bitrix24-specific SDK dependency on non-Bitrix24 consumers; lets a Bitrix24 user pass in the `@bitrix24/b24jssdk` logger themselves; lets others wire `pino` / `consola` / silent.
   *Acceptance:* `grep -r "console\." src/` returns nothing; `Logger` interface exported from `src/types.ts`; `RabbitMQConfig` accepts an optional `logger` field; URL credentials sanitized before any log; test verifies no password appears in captured log output and that a custom logger receives the calls.
6. [ ] **Type tightening** — remove `any` from `types.ts` / `rpc.ts`; add JSDoc to every public method.
   *Acceptance:* `grep -rn ": any" src/` returns nothing in the public surface; typedoc / tsc-derived signature has docstrings for `Producer.publish`, `Consumer.registerHandler`, `Consumer.consume`, `RPC.call`.

## Track 2 — Onboarding & positioning

### Sprint A — perception & onboarding

- [x] **Runnable `examples/`** — `01-uniform-distribution` and `02-retry-dlq` linked from README. *(PR #5)*
- [x] **`package.json` keywords** broadened and lowercased. *(PR #5)*
- [x] **"Not only for Bitrix24" tagline** in README. *(PR #5)*
- [x] **RPC removed from public exports** until verified — `src/index.ts` no longer re-exports `RabbitRPC`. Re-introduction is gated on Track 1 Phase 1 #1.
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
- [ ] **`examples/02-retry-dlq/rabbitmq.config.ts` — DLX via raw `options.arguments`** instead of the typed `queue.deadLetter` field.
  *Why:* hides the library's abstraction and accidentally avoids the `x-max-priority` bug from Track 1 #3.
  *Acceptance:* switch to `deadLetter: { exchange, routingKey }` **after** Track 1 #3 lands.
- [ ] **`examples/*/package.json` missing** — `pnpm exec tsx` won't work without `pnpm init`.
  *Acceptance:* add a minimal `package.json` (`name`, `version`, `type: "module"`) to each example folder; rewrite README steps.
- [ ] **`examples/02-retry-dlq/dlq-drain.ts` — full `msg` logged** (potential PII).
  *Acceptance:* selective log of non-sensitive envelope fields + comment about PII risk.
- [ ] **README integrator section — `amqps://user:pass@host` URL form** advertises credentials in a string that current logging would leak.
  *Acceptance:* once Track 1 #5 lands, show a composed `{ hostname, username, password }` config form instead.
- [x] **`package.json` `keywords` — `rpc` removed** until issue #6 resolves.

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
- [ ] **uuidv7 full-UUID monotonicity** — assert ordering on the whole UUID string, not just the 48-bit time prefix.

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
- Open issues: [#2](https://github.com/bitrix24/b24rabbitmq/issues/2) (Track 3 discussion board), [#6](https://github.com/bitrix24/b24rabbitmq/issues/6) (verify RPC).
