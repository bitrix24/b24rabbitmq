# Deployment recipes

`@bitrix24/b24rabbitmq` is a library, not a runnable service — `npm install` is the whole install story for the package itself.

But the **worker processes** that *use* this library do get deployed to client servers (VPS, Docker hosts, Kubernetes clusters, sometimes legacy Bitrix24 hosting). This directory is a set of copy-pasteable starting points for those deployments.

Nothing here is shipped to npm (`package.json` `files[]` excludes it).

## Files

| File | Use case |
|---|---|
| [`Dockerfile.worker`](Dockerfile.worker) | Minimal multi-stage Dockerfile for a Node.js worker that imports this library and runs a consumer. |
| [`docker-compose.yml`](docker-compose.yml) | Local-and-staging baseline: worker + RabbitMQ with the management UI. |
| `systemd-worker.service` *(planned)* | For VPS hosts without Docker (common in legacy Bitrix24 setups). |
| `k8s/` *(planned)* | `Deployment` + `ConfigMap` + `Secret` skeleton with healthcheck and graceful-shutdown notes. |

## Operational notes (read once before deploying)

- **Credentials in env vars, not in URLs.** Pass `RABBITMQ_HOST`, `RABBITMQ_USER`, `RABBITMQ_PASS`, `RABBITMQ_VHOST` separately and compose the `RabbitMQConfig.connection.url` from them — don't put `amqps://user:pass@host` in a single env var that may end up in logs.
- **TLS (`amqps://`) outside localhost.** Always. Managed brokers (CloudAMQP, AWS MQ) only accept TLS on the public endpoint anyway. For LGPD/GDPR data, this is non-negotiable.
- **Graceful shutdown.** Catch `SIGTERM` and let in-flight handlers finish (or `nack` them) before closing the channel and connection. A graceful-shutdown helper is on the roadmap (Track 4); until then, your worker process has to do this itself.
- **Healthcheck.** A simple HTTP `/healthz` that asserts the consumer is connected is enough for most platforms (compose, k8s). The library does not expose connection state yet — wrap your own boolean.
- **Resource sizing.** A worker process is mostly idle (just waits on the channel). 256 MB RAM and ~0.1 CPU is plenty for typical Bitrix24 event volumes; scale horizontally via consumer instances (RabbitMQ's round-robin handles the distribution — see `examples/01-uniform-distribution`).

See [`PROJECT-BRIEF.md`](../PROJECT-BRIEF.md) Track 6 for the planned items in this directory.
