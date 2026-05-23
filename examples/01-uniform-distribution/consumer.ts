import { RabbitMQConsumer } from '@bitrix24/b24rabbitmq'
import { rabbitMQConfig } from './rabbitmq.config'

const consumer = new RabbitMQConsumer(rabbitMQConfig)
await consumer.initialize()

consumer.registerHandler('demo1.v1', async (msg, ack, nack) => {
  try {
    const dots = (msg as { task: string }).task
    const seconds = dots.length
    console.log(`Processing task (${seconds}s): ${dots}`)
    await new Promise(resolve => setTimeout(resolve, seconds * 1000))
    console.log(`Task completed: ${dots}`)
    ack()
  } catch (error) {
    // Do NOT ack on error — it silently drops the message. nack routes it
    // through the configured dead-letter exchange (or back into the queue,
    // depending on broker config) so failures stay visible.
    console.error('Error processing task:', error)
    nack()
  }
})

await consumer.consume('demo1.v1')
