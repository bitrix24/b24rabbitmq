# Example 1: Uniform Distribution

> Need to create 1 `queue` and 3 `consumer`s.
>
> Let the `producer` send a message with dots. 1 dot = 1 second delay in the `consumer`.
>
> Distribute messages evenly among available `consumer`s.

## Example Implementation in TypeScript:

> The snippets below use `console.*` in the example's own code for brevity.
> To route the library's *internal* diagnostics through your own logger,
> pass `logger: yourLogger` in `RabbitMQConfig` (see README).

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

### Producer:
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

### Consumer:
```typescript
// consumers/demo1-consumer.ts
import { RabbitMQConsumer } from '@bitrix24/b24rabbitmq';
import { rabbitMQConfig } from '../rabbitmq.config';

const consumer = new RabbitMQConsumer(rabbitMQConfig);
await consumer.initialize();

consumer.registerHandler('demo1.v1', async (msg, ack, nack) => {
  try {
    const dots = (msg as { task: string }).task;
    const seconds = dots.length;
    
    console.log(`Processing task (${seconds}s): ${dots}`);
    await new Promise(resolve => setTimeout(resolve, seconds * 1000));
    
    console.log(`Task completed: ${dots}`);
    ack();
  } catch (error) {
    // Do NOT ack on error — it silently drops the message. nack routes it
    // through the configured dead-letter exchange (or back into the queue,
    // depending on broker config) so failures stay visible.
    console.error('Error processing task:', error);
    nack();
  }
});

await consumer.consume('demo1.v1');
```

### Launch:
1. Start 3 consumer instances:

```bash
npx tsx consumers/demo1-consumer.ts
```

2. Start the producer:

```bash
npx tsx producers/demo1-producer.ts
```


### Mechanism:
1. Producer sends tasks to the `demo1.events.v1` exchange
2. Messages land in the `demo1.v1` queue
3. 3 consumers evenly receive messages due to:
   - `prefetchCount: 1` (process one message at a time)
   - RabbitMQ's Round-robin algorithm

### Validation of Results:

Consumer 1: Processing task (3s): ...
Consumer 2: Processing task (4s): ....
Consumer 3: Processing task (5s): .....
Consumer 1: Task completed: ...
Consumer 1: Processing task (2s): ..
Consumer 2: Task completed: ....
Consumer 2: Processing task (1s): .


---

[↑ Theory](../1_page.md) | [Example 2: Balcony and Garden →](2_page.md)
