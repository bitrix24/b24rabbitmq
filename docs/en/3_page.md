# Usage

## Queue Monitoring

If you want to see which queues currently exist in RabbitMQ, you can do so using the rabbitmqctl command (requires superuser privileges):

shell
sudo rabbitmqctl list_queues

# output
Listing queues ...
demo.v1    0
...done.


Monitoring script:
shell
watch 'sudo /usr/sbin/rabbitmqctl list_queues name messages_unacknowledged messages_ready messages durable auto_delete consumers | grep -v "\.\.\." | sort | column -t;'


Displays and updates every 2 seconds a table with the list of queues:

* queue name;
* number of messages being processed;
* number of messages ready for processing;
* total number of messages;
* queue durability to service restart;
* whether it is a temporary queue;
* number of subscribers.

## Via Public Area
* [Queue Statistics](/page/rabbitmq/)

## Via Console and the `[shef.rabbitmq]` Module Application
shell
su bitrix
cd /home/bitrix/www/bitrix/modules/shef.rabbitmq
php cli-app

# Send a message (Ctrl + D to finish input)
php cli-app shef.rabbitmq:stdin-producer demo

php cli-app shef.rabbitmq:consumer -m5 demo


## Via Console and `[shef.cli]`
@todo

## Via `[supervisor]`

shell
# Start
supervisorctl start shef-rabbitmq-consumer-demo

# Stop
supervisorctl stop shef-rabbitmq-consumer-demo

# Reconfigure
supervisorctl reread
supervisorctl update


Go to `/etc/supervisord.d` and create a file for the daemon `shef-rabbitmq-consumer-demo.conf`

conf
[program:shef-rabbitmq-consumer-demo]
command=php cli-app shef.rabbitmq:consumer -m1000 -l80 demo
;process_name=%(program_name)s_%(process_num)02d
numprocs=1 ;number of processes copies to start (def 1)
directory=/home/bitrix/www/bitrix/modules/shef.rabbitmq/
autostart=true
autorestart=true
startretries=6
user=bitrix
stopsignal=KILL
redirect_stderr=true
stdout_logfile=/home/bitrix/www/local/sh_log/shef.rabbitmq.consumer.demo.log
stdout_logfile_maxbytes=1MB
stdout_logfile_backups=10


If multiple processes need to be launched, then:

* uncomment `process_name`
* specify the required number in `numprocs`
* remember to stop them via `supervisorctl stop shef-rabbitmq-consumer-demo:*`


[← Configuration](docs/2_page.md) | [↑ Contents](README.md) | [Software Installation →](docs/4_page.md)