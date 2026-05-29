# Changelog

## [0.2.0](https://github.com/bitrix24/b24rabbitmq/compare/v0.1.0...v0.2.0) (2026-05-29)


### Added

* **logger:** dependency-inject Logger; scrub URL credentials in diagnostics ([#15](https://github.com/bitrix24/b24rabbitmq/issues/15)) ([6400973](https://github.com/bitrix24/b24rabbitmq/commit/64009738ef71b4ce88a9f02a0caf8b83149fe848))


### Bug Fixes

* **base:** merge x-max-priority, dead-letter and caller arguments into one object ([#10](https://github.com/bitrix24/b24rabbitmq/issues/10)) ([86f663b](https://github.com/bitrix24/b24rabbitmq/commit/86f663b360755773ae0147e1a6becb4bf38810fb))
* **consumer:** bounded async reconnect with topology re-assertion ([#14](https://github.com/bitrix24/b24rabbitmq/issues/14)) ([56d7bc5](https://github.com/bitrix24/b24rabbitmq/commit/56d7bc5f0f01cc6f33704c8051cc19a3ef005649))
* **consumer:** make ack/nack idempotent per delivery (Phase 1 [#7](https://github.com/bitrix24/b24rabbitmq/issues/7)) ([#17](https://github.com/bitrix24/b24rabbitmq/issues/17)) ([c1259cb](https://github.com/bitrix24/b24rabbitmq/commit/c1259cb1eb05c02b7de22f09621f74129e0c3f12))
* **producer:** drop prefetch on publish channel, document publish() return semantics ([#13](https://github.com/bitrix24/b24rabbitmq/issues/13)) ([aa32cf3](https://github.com/bitrix24/b24rabbitmq/commit/aa32cf3bbd9ee9d52c2bb4f925edbf2e9d37ca3f))
* **release:** drop pnpm version pin from npm-publish.yml — packageManager wins ([#25](https://github.com/bitrix24/b24rabbitmq/issues/25)) ([e8326ae](https://github.com/bitrix24/b24rabbitmq/commit/e8326aeeedb97759de2a9099fc0d82eb91815580))
* **release:** unblock v0.1.0 npm publish — handle component-prefixed tag + Node 24 opt-in ([#23](https://github.com/bitrix24/b24rabbitmq/issues/23)) ([f24e8f2](https://github.com/bitrix24/b24rabbitmq/commit/f24e8f266c3c5840b863f0551ce355ba53a1d649))
* **type/Message:** improve ([d230605](https://github.com/bitrix24/b24rabbitmq/commit/d230605ad850f73db28efe0326a90b27c687bb0c))
* **uuidv7:** improve ([07e4956](https://github.com/bitrix24/b24rabbitmq/commit/07e4956b7ba8cbae0db0a64de2c0bf6bb0499d5a))
* **uuidv7:** improve ([4ecc743](https://github.com/bitrix24/b24rabbitmq/commit/4ecc743c52863b1e9ba27e242aceb75f3001acd1))
* **uuidv7:** support NodeJs (Issue [#2](https://github.com/bitrix24/b24rabbitmq/issues/2)) ([1912f3f](https://github.com/bitrix24/b24rabbitmq/commit/1912f3f2a0b00d740a0429fc0af636ab787bd02b))


### Changed

* drop RabbitRPC from v0.1 scope (closes [#6](https://github.com/bitrix24/b24rabbitmq/issues/6)) ([#12](https://github.com/bitrix24/b24rabbitmq/issues/12)) ([d2bf9e0](https://github.com/bitrix24/b24rabbitmq/commit/d2bf9e0b5e9cb2b7b985c6ea8edadf37c711a8e0))


### Documentation

* build, commit messages, ci aggregator — all green on ([d5217a3](https://github.com/bitrix24/b24rabbitmq/commit/d5217a32eac66d6dbe784d30125c3baec69bd371))
* **deps:** improve ([a699c70](https://github.com/bitrix24/b24rabbitmq/commit/a699c702a349fee77cabc5189cd091fae7e31065))
* **en:** add ([5683628](https://github.com/bitrix24/b24rabbitmq/commit/56836286977ff7c1b7ea23b3042fed46047a1aad))
* **en:** fix clear ([f565e4a](https://github.com/bitrix24/b24rabbitmq/commit/f565e4a52b7b6af87d4a31d4823dc1e573b21652))
* **en:** fix nav ([fd1c8e3](https://github.com/bitrix24/b24rabbitmq/commit/fd1c8e3d64ba40d6b15c3a4c73246931f7b98134))
* **en:** fix nav ([e241a3d](https://github.com/bitrix24/b24rabbitmq/commit/e241a3d44ad7f671842160dec871fd6d4065d548))
* improve ([c17e0d1](https://github.com/bitrix24/b24rabbitmq/commit/c17e0d10b3da3304557cb2fb791a72b7420eee03))
* positioning brief and bold reductions toward a credible v0.1 ([#5](https://github.com/bitrix24/b24rabbitmq/issues/5)) ([818411b](https://github.com/bitrix24/b24rabbitmq/commit/818411bd9c62853b41d71fc142c8daf9e58ae1e0))
* **README:** improve ([97fa377](https://github.com/bitrix24/b24rabbitmq/commit/97fa3778deff20d981e0de6b24447603b55aa194))
* **typedoc:** add API reference + PR-time JSDoc gate (Sprint C) ([#18](https://github.com/bitrix24/b24rabbitmq/issues/18)) ([97e4886](https://github.com/bitrix24/b24rabbitmq/commit/97e4886fe38e46f70c6c9112523c79d93623ace3))

## [0.1.0](https://github.com/bitrix24/b24rabbitmq/compare/b24rabbitmq-v0.0.4...b24rabbitmq-v0.1.0) (2026-05-29)

### Added

* **release-please-driven release flow + tag-triggered npm publish + OIDC trusted publishing.** New `.github/workflows/release-please.yml` + `.github/release-please-config.json` + `.release-please-manifest.json` wire up [release-please](https://github.com/googleapis/release-please): every push to `main` maintains a single "release-please" PR with the next version bump (computed from the Conventional Commits we've enforced since Phase 0) plus the relevant `## [x.y.z]` CHANGELOG additions. Merging the release PR creates the git tag (`v<x.y.z>`) and a matching GitHub Release. `.github/workflows/npm-publish.yml` now triggers on `release: types: [published]` (replacing the manual `workflow_dispatch`-only trigger; `workflow_dispatch` retained as a fallback) and adds a tag-vs-`package.json` version sanity check + `pnpm docs:build` dry-run mirroring the PR-time gate. Publish itself uses **npm OIDC trusted publishing** (npm 11.5.1+) — no long-lived `NPM_AUTH_TOKEN` secret stored in the repo; the workflow's `id-token: write` permission lets npm exchange a short-lived GitHub OIDC token for a one-shot publish credential. `--provenance` attestation (already wired in PR #4) is signed in the same flow. **One-time maintainer setup** (OIDC trusted-publisher binding on npmjs.com, branch protection on `main`, workflow read+write permissions) is documented in `CONTRIBUTING.md` "Release flow". (#19, #21)
* **TypeDoc API reference + PR-time JSDoc gate.** New `pnpm docs:build` / `pnpm docs:watch` scripts (powered by `typedoc` devDep + `typedoc.json` config) generate `docs/api/` HTML from `src/index.ts`'s public surface — every exported class and interface gets a generated page including the JSDoc landed in PR #16 / #17. A new `docs` job in `.github/workflows/ci.yml` runs `pnpm docs:build` on every PR as a dry-run so broken `{@link}` references, missing entry points, or other TypeDoc warnings fail BEFORE merge; `treatWarningsAsErrors: true` + `validation.invalidLink/notExported: true` in the TypeDoc config make this a hard gate. README gains an npm downloads badge and a short Documentation note pointing users at IDE hover (the JSDoc ships in `dist/esm/index.d.mts`) plus the `pnpm docs:build` local-HTML path. `eslint.config.mjs` ignores the generated `docs/api/**` so lint stays clean; `.gitignore` excludes it too. `typedoc.json` uses `readme: "none"` + `excludeProtected: true` to keep the landing page focused on the public surface (protected subclass plumbing stays internal). No public hosting is wired — TypeScript users get the docs through their editor, and the same `pnpm docs:build` HTML is what a public Pages deploy would have served. (#18)
* **Logger DI.** `RabbitMQConfig.logger` (optional) accepts any object satisfying the new exported `Logger` interface (`{ debug, info, warn, error }`, all required, shape-compatible with `console`, `pino`, `consola`, and the `@bitrix24/b24jssdk` logger). Default is a thin `console.*` wrapper — out-of-the-box behaviour is unchanged. Every diagnostic in `src/base.ts`, `src/producer.ts`, `src/consumer.ts` routes through the injected logger; the only `console.*` calls left in `src/` live inside the new `src/logger.ts` as the default adapter. New `sanitizeUrl` / `safeErrorMessage` helpers (also in `src/logger.ts`) scrub `amqp[s]://user:pass@host` credentials before any error message reaches the logger — applied wherever a caught error is fed to the log. (#15)

### Changed

* **types:** every `any` in the public surface (`src/types.ts`) is now `unknown` — `QueueParams.bindings[].headers`, `Message.additionalData`, the `Message` open index signature, and `MessageHandler<T = unknown>` (was `T = any`). The vestigial `[key: string]: any` index signature on `MessageOptions` is removed; `amqp.Options.Publish` already covers the typed publish fields and the index signature was a footgun. Every public method on `RabbitMQBase`, `RabbitMQProducer`, and `RabbitMQConsumer` now has a JSDoc block (including the merge semantics of `QueueParams.arguments`, the publish back-pressure semantics, and the `ack`/`nack` contract on `MessageHandler`). **Behavioural change for TypeScript callers** who relied on the implicit `any`: code that read off-spec fields from a `Message`, or that invoked a `MessageHandler` without a type parameter, will now need an explicit narrowing step (e.g. `if (typeof msg.foo === 'string')`) or an explicit `MessageHandler<MyType>`. Runtime behaviour is unchanged. (#16)
* **consumer:** reconnect is now bounded and safe. The old `handleReconnect` synchronously threw on max-retries-exceeded — an uncatchable crash path from the `'close'` event listener — and fired `this.connect()` inside `setTimeout` without awaiting it. New behaviour: an awaitable async loop with a `reconnectInProgress` guard against concurrent reconnects; sleeps `reconnectInterval` between attempts (`maxRetries: 0` disables reconnect entirely with a distinct log message); on success re-asserts the topology and re-subscribes every queue that had an active `consume()`; on exhaustion logs and returns instead of throwing. `connect()` no longer special-cases ENOTFOUND/ECONNREFUSED — all errors propagate; reconnect is driven solely by the `'close'` event. `RabbitMQConsumer.disconnect()` now clears the reconnect-tracking state so an instance can be safely re-`initialize()`d; `unRegisterHandler()` also drops the queue from the re-subscribe set so a future reconnect doesn't restore a dead handler. **Behavioural change** for callers who relied on the old synchronous throw to detect exhaustion: there is no programmatic state-introspection API yet (planned for Track 4); for now, observe the `error`-level log lines `max connection retries (N) exceeded` and `reconnect disabled (maxRetries=0)` (routed through your configured `Logger`, or `console.error` by default), or wrap `initialize()` in your own supervisor retry. (#14)
* **producer:** `channel.prefetch()` is no longer called inside `producer.connect()`. `prefetch` is a consumer-side flow-control setting; calling it on a publish channel was a no-op (plus one wasted broker round-trip per connect). New `connect()` carries a JSDoc note explaining this; `publish()` JSDoc now documents that its boolean return reflects only the client-side write buffer (back-pressure signal), not broker acknowledgment — see Track 4 for publisher confirms. The commented-out "exchange not registered" guard inside `publish()` is removed (lenient behaviour preserved; test pins it). (#13)

### Removed

* **`RabbitRPC` dropped from v0.1 scope.** The class was already unexported from the public barrel (since PR #5) pending verification; the verification confirmed two compounding defects (reply queue never subscribed; AMQP `properties.correlationId` not surfaced to handlers). Fixing them required an architectural change to `MessageHandler` for a primitive that no consumer was using yet — not justified for v0.1. Removed: `src/rpc.ts`, `src/tools/uuidv7.ts` (its only user), and their tests. If request/reply is needed, build it on top of `Producer` + `Consumer` for now; a properties-aware RPC may return in v0.2. (#12)

### Bug Fixes

* **consumer:** ack/nack idempotency in `buildDeliveryCallback()`. Each delivery now owns a `terminated` flag; only the first of `ack()` / `nack()` / catch-safety-net fires on the wire — subsequent terminal calls are suppressed (logged at `warn` so the handler bug stays discoverable at default log levels). Closes a protocol-error path where a handler that called `ack()` then threw caused BOTH `channel.ack` AND `channel.nack` to fire on the same message — amqplib treats the second terminal call as a channel-killing protocol error in production. The library now also calls the broker FIRST and flips `terminated` only on success, so a synchronous throw from `channel.ack/nack` (e.g. channel closed mid-handler) still falls through to the catch-safety-net `nack` instead of leaving the delivery unacked. Also covers double-ack, ack-then-nack, and confirms idempotency is per-delivery (no leak between messages). Six new tests (including a `logger.warn` lock for the suppressed-call diagnostic); the Phase 0 characterisation lock that pinned the "calls both ack and nack" defect was flipped to assert only the explicit `ack`. (#17)
* **base/registerQueue:** merge `x-max-priority`, dead-letter and caller-supplied `options.arguments` into a single `arguments` object passed to `channel.assertQueue`. Two compounding spread defects previously caused (a) the dead-letter pair to be silently dropped when both `maxPriority` and `deadLetter` were set, and (b) caller-supplied `options.arguments` to wholesale-replace the library-injected keys. **Behavioural change** for any consumer that previously combined raw `x-dead-letter-*` keys with `maxPriority`: both now reach the broker (correct), where before only the priority did. The redundant top-level `maxPriority` field is no longer passed, so explicit overrides via `options.arguments['x-max-priority']` now take effect on the wire. `maxPriority: 0` no longer ships an invalid `x-max-priority: 0` (AMQP requires 1–255); the key is omitted. (#10)

## [0.0.4](https://github.com/bitrix24/b24rabbitmq/compare/v0.0.3...v0.0.4) (2025-05-28)

### Fix

* **type/Message:** improve

## [0.0.3](https://github.com/bitrix24/b24rabbitmq/compare/v0.0.2...v0.0.3) (2025-05-08)

### Bug Fixes

* **uuidv7:** improve

## [0.0.2](https://github.com/bitrix24/b24rabbitmq/compare/v0.0.1...v0.0.2) (2025-05-07)

### Bug Fixes

* **uuidv7:** improve

## 0.0.1

### Chore

* **Initial commit**
