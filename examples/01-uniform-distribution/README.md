# Example 01 — Uniform distribution

One queue, three consumers, round-robin delivery. Each task is a string of
dots; one dot = one second of simulated work. RabbitMQ's `prefetchCount: 1`
plus its round-robin scheduler distribute work evenly across consumers.

Mirrors [`docs/en/demo/1_page.md`](../../docs/en/demo/1_page.md).

## Run it

```bash
# 1. Start RabbitMQ locally
docker run -d --name rabbitmq -p 5672:5672 -p 15672:15672 rabbitmq:3-management

# 2. Install deps (from this example's directory; they are declared in
#    this folder's package.json)
pnpm install

# 3. Start three consumer instances (in three terminals)
pnpm run consumer

# 4. Publish tasks
pnpm run producer
```

You should see consumers picking up tasks in round-robin order, each
processing its task for a number of seconds equal to the number of dots.
