# Example 2: Balcony and Garden

Source of the example [Diving into the Rabbit Hole](https://php.zone/post/rabbitmq)

> Let the rabbits (messages) jump into the hole (`exchange`).
> The rabbit reaches the room (`queue`) and tries to exit through the door (`consumer`).
>
> __Conditions:__
>
> * rabbits should not be lost uncontrollably;
> * if a rabbit fails to exit, it climbs out through the window onto the balcony (`queue` without `consumer`), and returns to the room again;
> * if a rabbit fails to exit 5 times, it climbs out through the window into the garden (`queue` + `consumer`), where you must:
>	* feed it (process the message manually);
>	* or send it back into the hole;
>	* or send it _for valuable fur and nutritious meat_.

Now in normal terms. We must:

* process all messages;
* attempt to process a message 5 times in case of a problem;
* after 5 attempts, the message should move to a special queue for analysis;
* assign 3 handlers to one queue.

Here's how it's done:

## 1. Define the configuration

### Describe the main `exchange` (entry into the hole).
Messages from external systems will enter here.

* `name` = `demo2.events.v1`
* `type` = `direct`
* `durable` = `true`

### Describe the auxiliary `exchange` (window in the room: with a view of the balcony and garden):

* `name` = `demo2.service.v1`
* `type` = `direct`
* `durable` = `true`

### Describe the main `queue` (room).

It will direct messages to the `consumer`.

Bind it to 2 `exchanges`.

* `name` = `demo2.events.subscriptions-service.v1`
* `durable` = `true`
* arguments
	* `x-dead-letter-exchange` = `demo2.service.v1`
	* `x-dead-letter-routing-key` = `failed`
* bind
	* `exchange` = `demo2.events.v1`
	* `routing_key` = `event.succeeded`
* bind
	* `exchange` = `demo2.service.v1`
	* `routing_key` = `events.service`

### Describe the `queue` for temporary storage (balcony).
> __Purpose of the balcony__: wait for X time. Retry the attempt.
> 
> Used for hooks, etc.

The message should return to the main queue `demo2.events.subscriptions-service.v1` because it was not processed within 6 seconds.

Bind to `exchange` with the key `delay.6000`.

* `name` = `demo2.subscriptions-service.delayed.6000.v1`
* `durable` = `true`
* arguments
	* `x-message-ttl` = `6000`
	* `x-dead-letter-exchange` = `demo2.service.v1`
	* `x-dead-letter-routing-key` = `events.service`
* bind
	* `exchange` = `demo2.service.v1`
	* `routing_key` = `delay.6000`

### Describe the `queue` for problematic messages (garden).

> __Purpose of the garden__: collect problems in one place and process them manually/semi-automatically.

Bind to `exchange` with the key `failed`.

* `name` = `demo2.subscriptions-service.failed.v1`
* `durable` = `true`
* bind
	* `exchange` = `demo2.service.v1`
	* `routing_key` = `failed`

---

### Example implementation in TypeScript:

> Note that there's no need to read messages from the queue `demo2.subscriptions-service.delayed.6000.v1`.
> 
> Since messages from there will automatically move to our main queue, from which we already read.

typescript
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
      name: 'demo2.events.v1',
      type: 'direct',
      options: { durable: true }
    },
    {
      name: 'demo2.service.v1',
      type: 'direct',
      options: { durable: true }
    }
  ],
  queues: [
    // Main queue (room)
    {
      name: 'demo2.events.subscriptions-service.v1',
      options: {
        durable: true,
        arguments: {
          'x-dead-letter-exchange': 'demo2.service.v1',
          'x-dead-letter-routing-key': 'failed'
        }
      },
      bindings: [
        {
          exchange: 'demo2.events.v1',
          routingKey: 'event.succeeded'
        },
        {
          exchange: 'demo2.service.v1',
          routingKey: 'events.service'
        }
      ]
    },
    // Delayed queue (balcony)
    {
      name: 'demo2.subscriptions-service.delayed.6000.v1',
      options: {
        durable: true,
        arguments: {
          'x-message-ttl': 6000,
          'x-dead-letter-exchange': 'demo2.service.v1',
          'x-dead-letter-routing-key': 'events.service'
        }
      },
      bindings: [
        {
          exchange: 'demo2.service.v1',
          routingKey: 'delay.6000'
        }
      ]
    },
    // Problematic messages queue (garden)
    {
      name: 'demo2.subscriptions-service.failed.v1',
      options: { durable: true },
      bindings: [
        {
          exchange: 'demo2.service.v1',
          routingKey: 'failed'
        }
      ]
    }
  ],
  channel: {
    prefetchCount: 1
  }
};


### Main queue processing consumer:
typescript
// consumers/main-consumer.ts
import { RabbitMQConsumer } from '~/rabbitmq/consumer';
import { rabbitMQConfig } from '../rabbitmq.config';

const consumer = new RabbitMQConsumer(rabbitMQConfig);

consumer.registerHandler('demo2.events.subscriptions-service.v1', async (msg, ack) => {
  try {
    const retryCount = msg.headers['x-retry-count'] || 0;
    
    if (retryCount >= 5) {
      throw new Error('Max retries exceeded');
    }

    // Business logic processing
    await processMessage(msg);
    
    ack();
  } catch (error) {
    const retryCount = msg.headers['x-retry-count'] || 0;
    const newRetryCount = retryCount + 1;

    if (newRetryCount < 5) {
      // Send to the balcony with a delay
      await consumer.publish(
        'demo2.service.v1',
        'delay.6000',
        msg,
        {
          headers: { 'x-retry-count': newRetryCount }
        }
      );
    } else {
      // Send to the garden
      await consumer.publish(
        'demo2.service.v1',
        'failed',
        { ...msg, error: error.message }
      );
    }
    ack();
  }
});


### Problematic messages processing consumer (garden):
typescript
// consumers/failed-consumer.ts
import { RabbitMQConsumer } from '~/rabbitmq/consumer';
import { rabbitMQConfig } from '../rabbitmq.config';

const consumer = new RabbitMQConsumer(rabbitMQConfig);

consumer.registerHandler('demo2.subscriptions-service.failed.v1', async (msg, ack) => {
  try {
    // Manual processing (feed the rabbit)
    if (shouldRetry(msg)) {
      await consumer.publish(
        'demo2.events.v1',
        'event.succeeded',
        msg.originalMessage
      );
    } else if (shouldProcessManually(msg)) {
      await manualProcessing(msg);
    } else {
      // Send for "fur and meat" (archiving/logging)
      await archiveMessage(msg);
    }
    
    ack();
  } catch (error) {
    console.error('Failed to process message:', error);
    ack();
  }
});


### Producer for sending messages:
typescript
// producers/event-producer.ts
import { RabbitMQProducer } from '~/rabbitmq/producer';
import { rabbitMQConfig } from '../rabbitmq.config';

const producer = new RabbitMQProducer(rabbitMQConfig);

export async function sendEvent(message: any) {
  await producer.publish(
    'demo2.events.v1',
    'event.succeeded',
    message,
    { persistent: true }
  );
}


### Starting consumers:
bash
# Start 3 main queue handlers
npm run start:consumer -- --queue=demo2.events.subscriptions-service.v1 --instances=3

# Start problematic messages handler
npm run start:consumer -- --queue=demo2.subscriptions-service.failed.v1


### Operation mechanism:
1. Messages are published to `demo2.events.v1` with routing key `event.succeeded`
2. The main queue attempts to process the message up to 5 times
3. On error, sends to the delayed queue via `demo2.service.v1/delay.6000`
4. After TTL of 6 sec, the message returns to the main queue
5. After 5 attempts, the message goes to the error queue via `demo2.service.v1/failed`
6. The garden handler decides the fate of the "rabbit"

---

[← Example 1: Even Distribution](docs/demo/1_page.md) | [↑ Theory](docs/1_page.md)