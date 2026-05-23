import { RabbitMQProducer } from '@bitrix24/b24rabbitmq'
import { rabbitMQConfig } from './rabbitmq.config'

const producer = new RabbitMQProducer(rabbitMQConfig)
await producer.initialize()

const tasks = ['...', '....', '.....', '..', '.']
for (const task of tasks) {
  await producer.publish(
    'demo1.events.v1',
    'event.succeeded',
    { task },
    { persistent: true }
  )
  console.log(`Sent task: ${task}`)
  await new Promise(resolve => setTimeout(resolve, 1000))
}

await producer.disconnect()
