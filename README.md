# @bitrix24/b24rabbitmq

Working with the RabbitMQ queue broker.

Allows to configure `exchanges`, `queues`. Includes templates for `Producer`, `Consumer` in NodeJs.

> We will add PHP support soon.

> **WARNING**
> We are still updating this page
> Some data may be missing here — we will complete it shortly.

## Configuration example

```typescript
// rabbitmq.config.ts
import type { RabbitMQConfig } from '~/rabbitmq/types';

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
import { RabbitMQProducer } from '~/rabbitmq/producer';
import { rabbitMQConfig } from '../rabbitmq.config';

const producer = new RabbitMQProducer(rabbitMQConfig);

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

## Documentation

* [CHANGELOG](CHANGELOG.md)
* [Terms](docs/en/1_page.md)
  * [Demo 1: Even Distribution](docs/en/demo/1_page.md)
  * [Demo 2: Balcony and Garden](docs/en/demo/2_page.md)

## Read

- [Official documentation RabbitMQ](https://www.rabbitmq.com/documentation.html)
- [RabbitMQ Patterns: Work Queues](https://www.rabbitmq.com/tutorials/tutorial-two-dotnet.html)
- [Understanding Prefetch](https://www.rabbitmq.com/consumer-prefetch.html)
- [101 Ways to Cook RabbitMQ and a Little About Pipeline Architecture](https://highload.guide/blog/101-RabbitMQ-way-of-cooking.html)
