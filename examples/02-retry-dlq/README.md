# Example 02 — Dead-letter queue (DLX-driven)

Failed messages are routed automatically to a separate "failed" queue
via RabbitMQ's `x-dead-letter-exchange` argument. The worker just
calls `nack()` on failure (the library always sets `requeue=false`,
which sends the message straight to the configured DLX); no manual
republish from the handler is needed.

This is the **minimal native-DLQ pattern**. For the more elaborate
"balcony & garden" retry-with-delay topology, see
[`docs/en/demo/2_page.md`](../../docs/en/demo/2_page.md).

## Run it

```bash
# 1. Start RabbitMQ locally
docker run -d --name rabbitmq -p 5672:5672 -p 15672:15672 rabbitmq:3-management

# 2. Install deps (from this example's directory; they are declared in
#    this folder's package.json)
pnpm install

# 3. Start the worker (terminal 1) and the DLQ drainer (terminal 2)
pnpm run worker
pnpm run drain

# 4. Publish a mix of "ok" and "fail" events
pnpm run producer
```

Expected: the worker ack's `ok` events, nack's `fail` ones; the DLQ
drainer prints the failed events as RabbitMQ routes them through the
dead-letter exchange.
