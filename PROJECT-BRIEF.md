# @bitrix24/b24rabbitmq — Project Brief

> **Status**: reanimation, pre-v0.1. This document is the **single source of truth** for the plan. Issues, `POSITIONING.md`, PR descriptions and `AGENTS.md` reference items here and add detail; they do not duplicate the plan.

## Goal

Ship a trustworthy **v0.1** of `@bitrix24/b24rabbitmq` — a small, dependency-light, config-driven TypeScript wrapper over [`amqplib`](https://github.com/amqp-node/amqplib) with `Producer`, `Consumer` and `RPC` primitives for integrating Bitrix24 applications (and any Node.js + RabbitMQ service) with sane defaults: reconnect, dead-letter, priority, declarative topology. ESM only.

## Acceptance criteria for v0.1

The release is "trustworthy" when **all** are true:

- **Correctness**: zero known correctness defects with severity above *minor*; every exported public API works as documented; nothing exported that fails on first call.
- **Tests**: every exported class has at least characterization-level vitest coverage against a mocked `amqplib` channel; uuidv7 stays at ~100%; coverage threshold floor enforced in CI.
- **Logging**: `src/` contains zero stray `console.*`; all logging goes through the `@bitrix24/b24jssdk` logger; AMQP URL credentials are not leaked to logs.
- **Docs**: README has a runnable Quickstart and a positioning paragraph for Bitrix24 integrators; `examples/` has at least two runnable end-to-end scenarios; `docs/en/` complete; `docs/ru` either delivered or honestly absent (no broken promise).
- **Process**: release is tag-gated (not free `workflow_dispatch`); npm provenance shipped; CI matrix on Node 20 + 22; branch protection on `main`; commitlint on every PR.

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
| Logging | `@bitrix24/b24jssdk` logger | Runtime dependency; will replace stray `console.*` |
| Docs i18n | AI-agent skill (see #3) | EN → RU markdown translation, no LLM SDK dependency |

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
- [x] **Dependency refresh** — bring devDeps to latest stable; drop unused runtime deps; add `@bitrix24/b24jssdk` for logging; clean Dependabot alerts. *(PR #4)*
- [x] **Positioning brief & onboarding Sprint A/B safe items** — runnable `examples/`, README integrator section, keywords broadening, Demo 2 dual subtitle. *(PR #5)*
- [ ] **Characterization tests** for `base` / `producer` / `consumer` / `rpc` against a mocked `amqplib` channel.
  *Acceptance:* every exported class has at least one test asserting the current happy-path behaviour; tests pass on `main`; they form the baseline Phase 1 fixes must not regress.

### Phase 1: Correctness refactor

Test-first, one defect per PR.

1. [ ] **RPC: verify, then fix or delete** — *issue #6*. As of PR #5 `RabbitRPC` is no longer exported from `src/index.ts`; the file remains in the tree as the starting point.
   *Why:* the "broken" claim was inferred from code reading, not proven by a test. Until proven and fixed, the class should not ship — currently enforced by the missing export.
   *Acceptance:* a vitest under `tests/rpc.test.ts` exercises `RabbitRPC.call()` against a mocked `amqplib`. Two possible outcomes: **(a) defect confirmed** → fix + regression test + re-export from `src/index.ts`; **(b) not actually broken** → correct the docs and re-export with the test as baseline. A third explicit option: **(c) delete `src/rpc.ts`** if we decide RPC is out of scope for v0.1.
2. [ ] **Consumer reconnect safety** — `throw` inside `setTimeout` crashes the process; `this.connect()` is not awaited.
   *Acceptance:* bounded async backoff loop; handlers re-established after reconnect; vitest simulates connection drop and asserts recovery.
3. [ ] **`base.ts registerQueue` — `x-max-priority` merge under dead-letter.** The `deadLetter` branch overwrites `options.arguments`.
   *Acceptance:* a queue declared with both `maxPriority` and `deadLetter` passes both through to `channel.assertQueue` arguments; test asserts the merged shape.
4. [ ] **Producer hygiene** — remove `channel.prefetch` from the publish channel (meaningless there); decide on publisher confirms so `publish()`'s boolean return is trustworthy.
   *Acceptance:* `producer.connect()` does not call `prefetch`; `publish()` JSDoc documents return-value semantics.
5. [ ] **Logger migration** `console.*` → `@bitrix24/b24jssdk`.
   *Acceptance:* `grep -r "console\." src/` returns nothing; URL credentials sanitized before any log; test verifies no password appears in captured log output.
6. [ ] **Type tightening** — remove `any` from `types.ts` / `rpc.ts`; add JSDoc to every public method.
   *Acceptance:* `grep -rn ": any" src/` returns nothing in the public surface; typedoc / tsc-derived signature has docstrings for `Producer.publish`, `Consumer.registerHandler`, `Consumer.consume`, `RPC.call`.

## Track 2 — Onboarding & positioning

Audience analysis and regional UX review live in [`docs/POSITIONING.md`](docs/POSITIONING.md). The plan items are here.

### Sprint A — perception & onboarding

- [x] **Runnable `examples/`** — `01-uniform-distribution` and `02-retry-dlq` linked from README. *(PR #5)*
- [x] **`package.json` keywords** broadened and lowercased. *(PR #5)*
- [x] **"Not only for Bitrix24" tagline** in README. *(PR #5)*
- [x] **RPC removed from public exports** until verified — `src/index.ts` no longer re-exports `RabbitRPC`. Re-introduction is gated on Track 1 Phase 1 #1.
- [x] **"Known limitations" consolidated** into Track 1 Phase 1 above; `AGENTS.md` and `docs/ARCHITECTURE.md` now link back instead of duplicating the list.

### Sprint B — regional commitment

- [x] **"For Bitrix24 integrators" README section** — PHP→Node bridge, broker hosting table, TLS reminder. *(PR #5)*
- [x] **Demo 2 dual subtitle** "Balcony and Garden — Retry with Dead-Letter Queue (DLQ)" for SEO and clarity. *(PR #5)*
- [ ] **`docs/ru` minimum** — README + Quickstart + Demo 1 via the translation skill. *Blocked by #3.*
  *Acceptance:* `docs/ru/` mirrors `docs/en/` with the glossary preserved (`RabbitMQ`, `Bitrix24`, `producer`, `consumer`, `queue`, `exchange`).
- [ ] **`docs/pt-BR` minimum** — same skill applied. *Tracked in #7, blocked by #3.*
  *Acceptance:* same as `docs/ru`.

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
- [ ] **`POSITIONING.md` §6 → here.** Already done; ensure POSITIONING.md does not re-grow its own plan.

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
- [ ] **Graceful shutdown helpers**.
- [ ] **PHP consumer/producer template** (README originally promised "PHP support soon").
- [ ] **Expand demos** beyond the two current scenarios (delayed retry / priority queues / fan-out).

---

## Non-functional requirements

- **License**: MIT
- **Module**: ESM only; no CommonJS unless a consumer needs it
- **Dependencies**: keep runtime deps minimal (`@bitrix24/b24jssdk` for logging; `amqplib` is a peer). `b24jssdk` is a deliberate choice for Bitrix24-ecosystem consistency despite its transitive weight (axios/luxon); its logger is not wired into `src/` yet — that happens in Track 1 Phase 1 #5.
- **Tests**: every behavioural change ships with a vitest test; broker-touching logic uses a mocked `amqplib` channel.
- **Commits**: Conventional Commits, enforced by commitlint in CI.
- **Secrets**: never committed.
- **Docs**: English in `docs/en`, translated to `docs/ru` and `docs/pt-BR` by the AI-agent skill (see #3 / #7).

## Related artefacts

- [`docs/POSITIONING.md`](docs/POSITIONING.md) — audience analysis & regional UX review. Does **not** duplicate this plan.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — runtime model and lifecycle.
- [`AGENTS.md`](AGENTS.md) — operational guide for AI assistants.
- Issues: [#2](https://github.com/bitrix24/b24rabbitmq/issues/2) (Track 3 discussion board), [#3](https://github.com/bitrix24/b24rabbitmq/issues/3) (RU translation skill), [#6](https://github.com/bitrix24/b24rabbitmq/issues/6) (verify RPC), [#7](https://github.com/bitrix24/b24rabbitmq/issues/7) (PT-BR translation).
