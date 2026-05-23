import type { RabbitMQConfig } from '@bitrix24/b24rabbitmq'

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
        { exchange: 'demo1.events.v1', routingKey: 'event.succeeded' }
      ]
    }
  ],
  channel: { prefetchCount: 1 }
}
