# @bitrix24/b24rabbitmq

[![CI](https://github.com/bitrix24/b24rabbitmq/actions/workflows/ci.yml/badge.svg)](https://github.com/bitrix24/b24rabbitmq/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/@bitrix24/b24rabbitmq.svg)](https://www.npmjs.com/package/@bitrix24/b24rabbitmq)
[![license](https://img.shields.io/npm/l/@bitrix24/b24rabbitmq.svg)](LICENSE)
[![node](https://img.shields.io/node/v/@bitrix24/b24rabbitmq.svg)](package.json)

Config-driven `Producer`, `Consumer` and `RPC` primitives over [`amqplib`](https://github.com/amqp-node/amqplib) for integrating Bitrix24 applications with RabbitMQ. Declare your exchanges, queues and bindings once; get priority and dead-letter handling out of the box.

> Built primarily for Bitrix24 integrators, but works for any Node.js service that needs RabbitMQ with sensible defaults.

> **Status:** actively being reanimated (2026), pre-v0.1. See [`PROJECT-BRIEF.md`](PROJECT-BRIEF.md) for the roadmap and known limitations. PHP templates are planned (see roadmap).

## Quickstart

Install the library and the `amqplib` peer dependency:

```bash
pnpm add @bitrix24/b24rabbitmq amqplib
# or: npm i @bitrix24/b24rabbitmq amqplib
```

Spin up a local RabbitMQ (with the management UI on http://localhost:15672):

```bash
docker run -d --name rabbitmq -p 5672:5672 -p 15672:15672 rabbitmq:3-management
```

Send and receive a message end-to-end:

```typescript
import {
  RabbitMQProducer,
  RabbitMQConsumer,
  type RabbitMQConfig
} from '@bitrix24/b24rabbitmq'

const config: RabbitMQConfig = {
  connection: { url: 'amqp://localhost' },
  exchanges: [{ name: 'demo.events.v1', type: 'direct', options: { durable: true } }],
  queues: [
    {
      name: 'demo.v1',
      options: { durable: true },
      bindings: [{ exchange: 'demo.events.v1', routingKey: 'event.succeeded' }]
    }
  ]
}

// Consumer
const consumer = new RabbitMQConsumer(config)
await consumer.initialize()
consumer.registerHandler('demo.v1', async (msg, ack) => {
  console.log('received', msg)
  ack()
})
await consumer.consume('demo.v1')

// Producer
const producer = new RabbitMQProducer(config)
await producer.initialize()
await producer.publish('demo.events.v1', 'event.succeeded', { hello: 'world' })
```

## Configuration example

```typescript
// rabbitmq.config.ts
import type { RabbitMQConfig } from '@bitrix24/b24rabbitmq';

export const rabbitMQConfig: RabbitMQConfig = {
  connection: {
    url: 'amqp://localhost',
    reconnectInterval: 5000,
    maxRetries: 5
  },
  exchanges: [
    {
      name: 'demo1.events.v1',
      type: 'direct',
      options: { durable: true }
    }
  ],
  queues: [
    {
      name: 'demo1.v1',
      options: { durable: true },
      bindings: [
        {
          exchange: 'demo1.events.v1',
          routingKey: 'event.succeeded'
        }
      ]
    }
  ],
  channel: {
    prefetchCount: 1
  }
};
```

### Example for `Producer`

```typescript
// producers/demo1-producer.ts
import { RabbitMQProducer } from '@bitrix24/b24rabbitmq';
import { rabbitMQConfig } from '../rabbitmq.config';

const producer = new RabbitMQProducer(rabbitMQConfig);
await producer.initialize();

export async function sendTask(dots: string) {
  await producer.publish(
    'demo1.events.v1',
    'event.succeeded',
    { task: dots },
    { persistent: true }
  );
  console.log(`Sent task: ${dots}`);
}

// Example message sending
const tasks = ['...', '....', '.....', '..', '.'];
tasks.forEach(async (task) => {
  await sendTask(task);
  await new Promise(resolve => setTimeout(resolve, 1000));
});
```

More examples can be found in [documentation](#documentation) and in [@bitrix24/app-template-automation-rules](https://github.com/bitrix24/app-template-automation-rules/tree/main/consumers/activities)

## Runnable examples

Clone the repo and look at [`examples/`](examples/) for end-to-end scripts you can `pnpm exec tsx` against a local RabbitMQ:

- [`examples/01-uniform-distribution`](examples/01-uniform-distribution/) — one queue, multiple consumers, round-robin.
- [`examples/02-retry-dlq`](examples/02-retry-dlq/) — minimal native dead-letter-queue pattern (DLX-driven `nack`).

## Documentation

* [Project brief & roadmap](PROJECT-BRIEF.md)
* [Architecture](docs/ARCHITECTURE.md)
* [Contributing](CONTRIBUTING.md)
* [CHANGELOG](CHANGELOG.md)
* [Terms](docs/en/1_page.md)
  * [Demo 1: Even Distribution](docs/en/demo/1_page.md)
  * [Demo 2: Balcony and Garden](docs/en/demo/2_page.md)

> A Russian translation under `docs/ru` is produced by an AI-agent skill (see [#3](https://github.com/bitrix24/b24rabbitmq/issues/3)).

## Read

- [Official documentation RabbitMQ](https://www.rabbitmq.com/documentation.html)
- [RabbitMQ Patterns: Work Queues](https://www.rabbitmq.com/tutorials/tutorial-two-dotnet.html)
- [Understanding Prefetch](https://www.rabbitmq.com/consumer-prefetch.html)
- [101 Ways to Cook RabbitMQ and a Little About Pipeline Architecture](https://highload.guide/blog/101-RabbitMQ-way-of-cooking.html)
