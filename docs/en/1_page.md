# Terms:  
## Message `[AMQPMessage]`  
This is the smallest unit of information within the message broker and processing service that can be processed.  

RabbitMQ itself stores messages in binary format, but for our system, this is not important. We will receive and process messages in the form of __JSON__.  

It is also worth mentioning that messages in RabbitMQ have __headers__.  

They are similar to HTTP request headers. This is an associative array where you can store necessary information.  

They are only stored in queues.  

## Producer `[producer]`  
A program that sends messages.  

## Consumer `[consumer]`  
A program that receives messages.  
Typically, the consumer is in a state of waiting for messages.  

## Queue `[queue]`  
RabbitMQ stores messages in a `queue`. It has no limit on the number of messages and can accept an arbitrarily large number of them—it can be considered an infinite buffer.  

Any number of ´producer´s can send messages to one `queue`, and any number of `consumer`s can receive messages from one `queue`.  

> `Producer`, `consumer`, and `RabbitMQ` do not have to be on the same physical machine; usually, they are on different ones.  

## Exchange `[exchange]`  
This point can be bound to `queue`s or other `exchange`s.  

An `exchange` does not store messages. Its primary function is to route messages to one or more `queue`s or similar `exchange`s.  

Each `queue` or `exchange` is bound using a `routing_key` (routing key).  

RabbitMQ has several different types of `exchange`s, which affect how the `exchange` routes incoming messages.  

## Routing Key `[routing_key]`  
This is simply a string divided into blocks. Each block is separated by a dot.  
The `routing_key` exists both for the `binding` of a `queue` to an `exchange` and for the message itself.  

> For example: `notify.sendEmail.sendSms`.  

At the same time, for the message's routing key, you can set patterns using special characters:  

* `*` — indicates that after the dot, there can be one arbitrary block;  
* `#` — indicates that after the dot, there can be any number of blocks.  

> For example: `notify.sendSms.*` or `notify.#`.  

## Types of `[exchange]`  

|      Type | Description                                                                                                 | Note                           |  
|----------:|:------------------------------------------------------------------------------------------------------------|:-------------------------------|  
|  `fanout` | Redirects the incoming message to all `queue`s or `exchange`s bound to it.                                  | The fastest. But not flexible. |  
|  `direct` | Routes the message based on whether the message's `routing_key` matches the `binding`'s `routing_key`.      | Used by default                |  
|   `topic` | Like `direct`, routes messages based on `routing_key`.<br>But the `routing_key` can be a __pattern__.       |                                |  
| `headers` | Uses message headers for routing.<br>Here, `queue`s are bound (`binding`) to `exchange`s using `arguments`. | The least performant.          |  

### Type `headers`  
The logic by which the `exchange` will route messages must be specified using the `x-match` key, which is set in the `binding`'s `arguments`.  

The key can take two values:  

* `all` — the message headers must fully match the binding's associative array;  
* `any` — the value must match at least one key.  

# Examples:  
* [Example 1: Even Distribution](docs/demo/1_page.md)  
* [Example 2: Balcony and Garden](docs/demo/2_page.md)  

# Calculating the Number of `consumer`s  

> Average sufficient number of `consumer`s = Ceiling(( Publish / Average(Consumer ack) ) * Ceiling(Publish))  

Example:  

* (2.4 / 0.8 ) * 3 = 9 = 9  
* (0.5 / 0.4 ) * 1 = 1.25 = 2  
----  

[↑ Contents](README.md) | [Configuration →](docs/2_page.md)
