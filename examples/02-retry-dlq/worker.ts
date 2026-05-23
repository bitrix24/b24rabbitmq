import { RabbitMQConsumer } from '@bitrix24/b24rabbitmq'
import { rabbitMQConfig } from './rabbitmq.config'

const consumer = new RabbitMQConsumer(rabbitMQConfig)
await consumer.initialize()

consumer.registerHandler('demo2.work.v1', async (msg, ack, nack) => {
  const event = msg as { id: number, kind: 'ok' | 'fail' }
  console.log(`Processing event #${event.id} (${event.kind})`)
  if (event.kind === 'fail') {
    // requeue=false sends the message to the configured dead-letter exchange.
    nack(false)
    console.log(`  -> nack: event #${event.id} routed to DLQ via DLX`)
    return
  }
  ack()
  console.log(`  -> ack: event #${event.id} done`)
})

await consumer.consume('demo2.work.v1')
