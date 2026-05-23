import { RabbitMQConsumer } from '@bitrix24/b24rabbitmq'
import { rabbitMQConfig } from './rabbitmq.config'

const consumer = new RabbitMQConsumer(rabbitMQConfig)
await consumer.initialize()

consumer.registerHandler('demo1.v1', async (msg, ack) => {
  try {
    const dots = (msg as { task: string }).task
    const seconds = dots.length
    console.log(`Processing task (${seconds}s): ${dots}`)
    await new Promise(resolve => setTimeout(resolve, seconds * 1000))
    console.log(`Task completed: ${dots}`)
    ack()
  } catch (error) {
    console.error('Error processing task:', error)
    ack()
  }
})

await consumer.consume('demo1.v1')
