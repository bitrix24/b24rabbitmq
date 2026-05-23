# Positioning, audience & movement plan

A working brief that complements [`PROJECT-BRIEF.md`](../PROJECT-BRIEF.md): the
roadmap document answers *what we are building and in what order*; this
document answers *who it is for, how it is perceived today, and what to ship
next to convert that perception into adoption*. Treat it as a living doc — it
gets pruned as items land.

Status: pre-`v0.1`, post-reanimation. Synthesised from a three-region UX
review (RU/CIS, EN-global, BR/LatAm) in May 2026.

---

## 1. What this project is

A thin TypeScript/ESM wrapper over [`amqplib`](https://github.com/amqp-node/amqplib)
that lets you declare an AMQP topology once (exchanges, queues, bindings,
priorities, dead-letter) and get `Producer` / `Consumer` / `RPC` primitives
with reconnect, JSON (de)serialization and error handling out of the box.

Primary audience: **Bitrix24 integrators** building Node.js services that
exchange messages with the rest of the Bitrix24 ecosystem.
Secondary audience: **any Node.js team using RabbitMQ** — the library is not
architecturally bound to Bitrix24; the brand framing currently obscures that.

## 2. What we ship

| Surface | Form |
|---|---|
| npm package | `@bitrix24/b24rabbitmq`, ESM-only, single bundle (`dist/esm/index.mjs` + `.d.mts`) |
| Public API | `RabbitMQBase`, `RabbitMQProducer`, `RabbitMQConsumer`, `RabbitRPC` + `RabbitMQConfig`, `Message`, `MessageHandler`, … (`src/index.ts`) |
| Peer dependency | `amqplib` (consumer installs it) |
| Runtime dependency | `@bitrix24/b24jssdk` (logger; not wired into `src/` yet — Phase 1) |
| Node engines | `^20 || >=22` |
| Lifecycle | `new C(config) → initialize() → registerHandler() + consume()` / `publish()` |

## 3. How the documentation is delivered

- **Where it lives:** Markdown under `docs/en/` (terms + two worked demos) plus
  the top-level `README.md`, `PROJECT-BRIEF.md`, `docs/ARCHITECTURE.md`,
  `CONTRIBUTING.md`, `AGENTS.md`, `.github/contributing/testing.md`.
- **What is missing:** no deployed docs site, no generated API reference (no
  TypeDoc), no `docs/ru` or `docs/pt-BR` (`docs/ru` is promised by issue #3
  but the directory does not exist yet; `docs/pt-BR` is tracked in #7).
- **Strengths:** runnable Quickstart in the README; runnable `examples/`
  folder; concise `ARCHITECTURE.md`; `PROJECT-BRIEF.md` as a single source of
  truth for roadmap + known defects; Demo 1 is complete and works as written.
- **Frictions:** "Known limitations" is restated in three files with small
  drifts; `docs/en/1_page.md` is titled `Terms:` (trailing colon); Demo 2 leans
  on a "Balcony & Garden" rabbit metaphor that taxes non-native readers and
  hides the doc from SEO for `dead-letter queue` searches.

## 4. What's useful for AI agents

| File | What it gives an agent |
|---|---|
| `AGENTS.md` | Source layout, command table, conventions, class hierarchy, lifecycle, and a **"Known limitations"** block that stops an agent from "fixing" deliberately-deferred bugs |
| `CLAUDE.md` | Thin redirect (`@AGENTS.md`) so Claude Code uses the same canon |
| `.github/contributing/testing.md` | Copy-pasteable `amqplib` channel mock factory and fake-timer guidance |
| Issues #2 and #3 | Tracking backlog and the planned AI-agent translation skill |

**Gaps:** agent guidance assumes English prompts; no spec yet for the
translation skill (#3 awaits a reference example); no pointer to the exact
`@bitrix24/b24jssdk` logger API agents should import when migrating
`console.*` calls in Phase 1.

---

## 5. Three-region review — top blockers

The full reviews live in the PR conversation; below are the points that
recurred or that materially block adoption.

### RU/CIS
- No `docs/ru` — issue #3 promises an AI-agent skill but the directory is
  empty; for a Bitrix24-heavy audience this reads as an unkept promise.
- No "PHP-on-Bitrix → Node-on-this-lib" mental bridge anywhere in the README.
  Most Bitrix24 partner devs come from PHP and need to be told how this fits
  next to their existing handlers.
- `RabbitRPC` is exported from `src/index.ts` but documented as broken only in
  internal files — a first-time user will try it and lose hours.

### EN / global OSS
- Brand framing (`@bitrix24/...`, "for Bitrix24 applications") makes the
  package look like internal tooling; one sentence in the README would fix it.
- `package.json` `keywords` were thin (`Bitrix24, RabbitMq, typescript`) —
  needed `amqp`, `rabbitmq`, `messaging`, `queue`, `dead-letter`, `rpc`.
- A broken `RabbitRPC` export ships on npm — same blocker as above, with a
  different framing.

### BR / LatAm
- No `docs/pt-BR` or `docs/es`; Bitrix24 has a strong partner channel in
  Brazil where many small agencies don't have a fluent-English senior dev.
- No mention of regional infrastructure: AWS `sa-east-1`, CloudAMQP, `amqps://`
  with TLS (LGPD compliance) — none of these appear in any example.
- The "Balcony & Garden" metaphor doubles cognitive load for non-native
  readers and hides the page from search engines.


---

## 6. Movement plan

**Moved to [`PROJECT-BRIEF.md`](../PROJECT-BRIEF.md) — the single source of truth.** This file keeps only the analysis (sections 1–5); the actionable plan lives in the brief under Tracks 1–4. Do not re-grow the plan here.
