import { RabbitMQConsumer } from '@bitrix24/b24rabbitmq'
import { rabbitMQConfig } from './rabbitmq.config'

const consumer = new RabbitMQConsumer(rabbitMQConfig)
await consumer.initialize()

consumer.registerHandler('demo2.failed.v1', async (msg, ack) => {
  // Log only non-sensitive envelope fields, not the full body — a dead
  // message can carry user PII. Strip / redact before logging in production.
  const envelope = msg as { id?: unknown; type?: unknown }
  console.log('DLQ message arrived:', { id: envelope.id, type: envelope.type })
  // In real code: store, alert, schedule a retry, etc.
  ack()
})

await consumer.consume('demo2.failed.v1')
