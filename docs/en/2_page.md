# Configuration

The configuration is based on [RabbitMqBundle](https://github.com/php-amqplib/RabbitMqBundle).

Settings are configured by editing the files `bitrix/.settings.php` or _(recommended)_ `bitrix/.settings_extra.php`.

## Example:

php
<?php
return [
	'..' => '..',
	'shef.rabbitmq' => [
		'value' => [
			'connections' => [
				'default' => [
					'host' => '127.0.0.1',
					'port' => 5672,
					'user' => 'admin',
					'password' => 'A_dmin-Pass123**',
					'vhost' => '/',
					'lazy' => false,
					'connection_timeout' => 3.0,
					'read_write_timeout' => 3.0,
					'keepalive' => false,
					'heartbeat' => 0,
					'use_socket' => true,
				],
			],
			'producers' => [
				'demo' => [
					'connection' => 'default',
					'exchange_options' => [
						'name' => 'demo.v1',
						'type' => 'direct',
					],
				],
			],
			'consumers' => [
				'demo' => [
					'connection' => 'default',
					'exchange_options' => [
						'name' => 'demo.v1',
						'type' => 'direct',
					],
					'queue_options' => [
						'name' => 'demo.v1',
					],
					'callback' => 'shef.rabbitmq.consumer.demo-callback',
					'enable_logger' => true,
					'logger' => 'shef.problems.log.debug'
				],
			],
		],
		'readonly' => false,
	]
];
?>


## Automatically generated `DI.Service`

|                               Name | Description                                                                                                                                           |
|-----------------------------------:|:---------------------------------------------------------------------------------------------------------------------------------------------------|
|                 `shef.rabbitmq.loader` | For initializing other services.<br>Uses the `init()` function to start initialization.                                                      |
|           `shef.rabbitmq.parts_holder` | Contains `DI.Service`: <br>* `shef.rabbitmq.binding` <br>* `shef.rabbitmq.base_amqp` <br>* `shef.rabbitmq.producer` <br>* `shef.rabbitmq.consumer` |

`DI.Service::shef.rabbitmq.loader` is called like this:
php
<?php
	if(!\Bitrix\Main\Loader::includeModule('shef.rabbitmq'))
	{
		throw new \Bitrix\Main\LoaderException('module shef.rabbitmq not loaded');
	}
	$serviceLocator = \Bitrix\Main\DI\ServiceLocator::getInstance();
	
	/** @var \Shef\RabbitMq\Main\RabbitMqLoader $loader */
	$loader = $serviceLocator->get('shef.rabbitmq.loader');
	// to initialize DI.Service ////
	$loader->init();
	// to initialize RabbitMQ structure ////
	$loader->setupFabric();
?>


## Common parameters `['shef.rabbitmq']`
|                  Key | Type     | Description                            | Note                                                                                                  |
|----------------------:|:--------|:------------------------------------|:------------------------------------------------------------------------------------------------------------|
| `is_use_memo_manager` | `bool`  | Flag for enabling queue manager | Debug info will include memory usage data                                             |
|             `sandbox` | `bool`  | Sandbox mode flag               | `bindings` block will not be loaded;<br>For `producers` block, it will load `\Shef\RabbitMq\RabbitMq\Fallback`. |
|         `connections` | `array` | See `Connection parameters`           | Generates `DI.Service`: <br>* `shef.rabbitmq.connection_factory.%s` <br>* `shef.rabbitmq.connection.%s`    |
|            `bindings` | `array` | See `Custom binding parameters`              | Generates `DI.Service`: <br>* `shef.rabbitmq.binding.%s`                                                   |
|           `producers` | `array` | See `Producer parameters`             | Generates `DI.Service`: <br>* `shef.rabbitmq.producer.%s`                                                  |
|           `consumers` | `array` | See `Consumer parameters`             | Generates `DI.Service`: <br>* `shef.rabbitmq.consumers.%s`                                                 |

## Connection parameters `['shef.rabbitmq']['connections'][%s]`
Generates `DI.Service`:
 
* `shef.rabbitmq.connection_factory.%s`
* `shef.rabbitmq.connection.%s`

|                             Key | Type      | Description                                           | Note                                                                                                                                                                               |
|---------------------------------:|:---------|:---------------------------------------------------|:-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
|                           `host` | `string` | IP or domain name                                | For local use `127.0.0.1`                                                                                                                                                 |
|                           `port` | `int`    | Port                                               | Most likely `5672`                                                                                                                                                                      |
|                           `user` | `string` | Login                                              |                                                                                                                                                                                          |
|                       `password` | `string` | Password                                             |                                                                                                                                                                                          |
|                          `vhost` | `string` |                                                    | Most likely `/`                                                                                                                                                                         |
|                           `lazy` | `bool`   | Lazy loading                                   | Better to disable `false`.<br/>Makes sense if the connection doesn't need to be established immediately.<br/>For example, during page generation. But this likely indicates an architectural issue. |
|             `connection_timeout` | `float`  |                                                    | Better to set `3.0`                                                                                                                                                                      |
|             `read_write_timeout` | `float`  |                                                    | Better to set `3.0`                                                                                                                                                                      |
|                      `keepalive` | `bool`   |                                                    | Better to disable `false`                                                                                                                                                                  |
|                      `heartbeat` | `int`    | __??__                                             | 0                                                                                                                                                                                        |
|                     `use_socket` | `bool`   | Use sockets                                | Better to enable `true`                                                                                                                                                                    |
| `connection_parameters_provider` | `string` | `DI.Service` for dynamic parameter generation | Must implement `\Shef\RabbitMq\Provider\ConnectionParametersProviderInterface`                                                                                            |

## Custom binding parameters `['shef.rabbitmq']['bindings'][...]`
If your application has a complex process, you need custom bindings.

Custom `binding` scenarios may include bindings between `exchange` via the `destination_is_exchange` property.

> Not connected in `sandbox` mode.

Generates `DI.Service`:

* `shef.rabbitmq.binding.%s` (%s - md5 of parameters)

Examples:
php
<?php
return [
	'..' => '..',
	'bindings' => [
		[
			'connection' => 'default',
			'exchange' => 'foo',
			'destination' => 'bar',
			'routing_key' => 'baz.*',
		],
		[
			'connection' => 'default',
			'exchange' => 'foo1',
			'destination' => 'foo',
			'routing_key' => 'baz.*',
			'destination_is_exchange' => true
		],
	]
];
?>

First, call `$loader->init()`. This function will declare `exchange` and `queue` as defined in your `producers`

[← Terms](1_page.md) | [↑ Contents](../../README.md) | [Usage →](3_page.md)
