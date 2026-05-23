import { RabbitMQProducer } from '@bitrix24/b24rabbitmq'
import { rabbitMQConfig } from './rabbitmq.config'

const producer = new RabbitMQProducer(rabbitMQConfig)
await producer.initialize()

const events = [
  { id: 1, kind: 'ok' },
  { id: 2, kind: 'fail' },
  { id: 3, kind: 'ok' },
  { id: 4, kind: 'fail' },
  { id: 5, kind: 'ok' }
]

for (const event of events) {
  await producer.publish(
    'demo2.events.v1',
    'event.succeeded',
    event,
    { persistent: true }
  )
  console.log(`Sent event:`, event)
}

await producer.disconnect()
