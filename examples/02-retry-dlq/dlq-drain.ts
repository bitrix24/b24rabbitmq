import { RabbitMQConsumer } from '@bitrix24/b24rabbitmq'
import { rabbitMQConfig } from './rabbitmq.config'

const consumer = new RabbitMQConsumer(rabbitMQConfig)
await consumer.initialize()

consumer.registerHandler('demo2.failed.v1', async (msg, ack) => {
  console.log('DLQ message arrived:', msg)
  // In real code: store, alert, schedule a retry, etc.
  ack()
})

await consumer.consume('demo2.failed.v1')
