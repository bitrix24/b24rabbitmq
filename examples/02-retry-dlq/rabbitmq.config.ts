import type { RabbitMQConfig } from '@bitrix24/b24rabbitmq'

/**
 * Topology:
 *   - main exchange (events) -> main queue (work)
 *     The main queue has x-dead-letter-exchange + x-dead-letter-routing-key
 *     so that any `nack(requeue=false)` (or rejection) is routed to the DLX.
 *   - dead-letter exchange (service) -> dead-letter queue (failed)
 *     A separate consumer can drain the DLQ for analysis / manual handling.
 */
export const rabbitMQConfig: RabbitMQConfig = {
  connection: {
    url: 'amqp://localhost',
    reconnectInterval: 5000,
    maxRetries: 5
  },
  exchanges: [
    { name: 'demo2.events.v1', type: 'direct', options: { durable: true } },
    { name: 'demo2.service.v1', type: 'direct', options: { durable: true } }
  ],
  queues: [
    {
      name: 'demo2.work.v1',
      options: {
        durable: true,
        arguments: {
          'x-dead-letter-exchange': 'demo2.service.v1',
          'x-dead-letter-routing-key': 'failed'
        }
      },
      bindings: [
        { exchange: 'demo2.events.v1', routingKey: 'event.succeeded' }
      ]
    },
    {
      name: 'demo2.failed.v1',
      options: { durable: true },
      bindings: [
        { exchange: 'demo2.service.v1', routingKey: 'failed' }
      ]
    }
  ],
  channel: { prefetchCount: 1 }
}
