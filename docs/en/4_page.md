# Software Installation

# RabbitMQ
## Ports
* 15672 - web interface
* 15673
* 5672 - for publishing and reading

## Management
shell
chkconfig rabbitmq-server on
systemctl enable rabbitmq-server
systemctl stop rabbitmq-server
systemctl start rabbitmq-server

systemctl status rabbitmq-server.service
journalctl -xe

# Close all connections
rabbitmqctl close_all_connections --vhost / "Closed by request"

sudo rabbitmqctl list_queues name > queue.txt
while read -r name; do sudo rabbitmqctl purge_queue "${name}" > q_.txt; done < queue.txt
sudo while read -r name; do echo $name; done < queue.txt

sudo rabbitmqadmin -f tsv -q list connections name > c.txt

$ while read -r name; do rabbitmqadmin -q close connection name="${name}"; done < c.txt

# reset all settings, returning the installation to a default state
# Be sure you really want to do this!
rabbitmqctl stop_app
rabbitmqctl reset
rabbitmqctl start_app



## Installation on CentOS 7
* [RabbitMQ : Install](https://www.server-world.info/en/note?os=CentOS_7&p=rabbitmq&f=1)
* [Install RabbitMQ on CentOS 7](https://gist.github.com/fernandoaleman/fe34e83781f222dfd8533b36a52dddcc)

### Install Erlang && Install RabbitMQ
shell
yum -y update
yum -y install epel-release
yum -y install wget
cd /tmp
wget http://packages.erlang-solutions.com/erlang-solutions-1.0-1.noarch.rpm
rpm -Uvh erlang-solutions-1.0-1.noarch.rpm
yum -y install erlang socat logrotate

wget https://github.com/rabbitmq/rabbitmq-server/releases/download/v3.8.35/rabbitmq-server-3.8.35-1.el8.noarch.rpm
rpm --import https://www.rabbitmq.com/rabbitmq-signing-key-public.asc
rpm -Uvh rabbitmq-server-3.8.35-1.el8.noarch.rpm

systemctl start rabbitmq-server
systemctl enable rabbitmq-server


### RabbitMQ Config
Open:
shell
vi /etc/rabbitmq/rabbitmq.conf


Add:
conf
listeners.ssl.default = 5671

#ssl_options.cacertfile = /path/to/cacertfile.pem
#ssl_options.certfile   = /path/to/certfile.pem
#ssl_options.keyfile    = /path/to/keyfile.pem
#ssl_options.verify     = verify_peer
#ssl_options.versions.1 = tlsv1.2
#ssl_options.versions.2 = tlsv1.1
#ssl_options.fail_if_no_peer_cert = false

#tcp_listen_options.backlog       = 128
#tcp_listen_options.nodelay       = true
#tcp_listen_options.exit_on_close = false
#tcp_listen_options.keepalive     = false

heartbeat = 580

# Ansible managed
# https://www.rabbitmq.com/configure.html
# https://github.com/rabbitmq/rabbitmq-server/blob/v3.7.x/docs/rabbitmq.conf.example
listeners.tcp.default               = 5672
disk_free_limit.absolute            = 1GB

# Customising TCP Listener (Socket) Configuration.
##
## Related doc guides:
##
## * http://rabbitmq.com/networking.html
## * http://www.erlang.org/doc/man/inet.html#setopts-2
##
tcp_listen_options.backlog          = 104
tcp_listen_options.nodelay          = true
tcp_listen_options.exit_on_close    = false

tcp_listen_options.keepalive        = true
tcp_listen_options.send_timeout     = 15000
tcp_listen_options.buffer           = 196608
tcp_listen_options.sndbuf           = 196608
tcp_listen_options.recbuf           = 196608

## Resource Limits & Flow Control
## ==============================
##
## Related doc guide: http://rabbitmq.com/memory.html.
vm_memory_high_watermark.relative       = 0.4
vm_memory_high_watermark_paging_ratio   = 0.6


Open:
shell
vi /etc/rabbitmq/rabbitmq-env.conf


> __Consider__:
> 
> * `RABBITMQ_MNESIA_BASE` - be careful with this parameter
> * `NODENAME` - change to the desired one
> * Determine how many processors can be allocated:
>   * `+sct L0-0c0-0 +S 1:1` - for 1 processor
>   * `+sct L0-0c1-1 +S 2:2` - for 2 processors
>   * `+sct L0-0c2-2 +S 3:3` - for 3 processors
>   * etc.

Consider and add:
conf
# Ansible managed
CONFIG_FILE=/etc/rabbitmq/rabbitmq.conf
#RABBITMQ_MNESIA_BASE=/var/lib/rabbitmq/mnesia
#NODENAME=rabbit@bitrix-vm.by
RABBITMQ_SERVER_ADDITIONAL_ERL_ARGS="+A 128 +sct L0-0c0-0 +S 1:1"
USE_LONGNAME=true


### iptables
shell
iptables -I INPUT -p tcp -m state --state NEW -m tcp --dport 15672 -j ACCEPT
iptables -I INPUT -p tcp -m state --state NEW -m tcp --dport 5672 -j ACCEPT
iptables -I INPUT -p tcp -m state --state NEW -m tcp --dport 5673 -j ACCEPT
iptables-save > /etc/sysconfig/iptables

### Firewall && SELinux
shell
firewall-cmd --zone=public --permanent --add-port=4369/tcp
firewall-cmd --zone=public --permanent --add-port=25672/tcp
firewall-cmd --zone=public --permanent --add-port=5671-5672/tcp
firewall-cmd --zone=public --permanent --add-port=15672/tcp
firewall-cmd --zone=public --permanent --add-port=61613-61614/tcp
firewall-cmd --zone=public --permanent --add-port=1883/tcp
firewall-cmd --zone=public --permanent --add-port=8883/tcp

firewall-cmd --reload

setsebool -P nis_enabled 1


### RabbitMQ Web Management Console
> __Consider__:
> 
> * Specify a complex password `password`
> * Delete the `guest` user
> * Add users for external access

shell
# Add admin
rabbitmq-plugins enable rabbitmq_management
chown -R rabbitmq:rabbitmq /var/lib/rabbitmq/
rabbitmqctl add_user admin
rabbitmqctl set_user_tags admin administrator
rabbitmqctl set_permissions -p / admin ".*" ".*" ".*"

# Change password
rabbitmqctl change_password admin


# SuperVisor


## Management
shell
systemctl enable supervisord
systemctl start supervisord
systemctl restart supervisord

# Verify that supervisord is running
ps aux | grep supervisord

# View supervisor log
less /var/log/supervisor/supervisord.log

# Start one service
supervisorctl start shef-rabbitmq-consumer-demo

# Stop one service
# supervisorctl stop shef-rabbitmq-consumer-demo:shef-rabbitmq-consumer-demo_00
supervisorctl stop shef-rabbitmq-consumer-demo

# Start all
supervisorctl start all

# Restart all services known to supervisor
supervisorctl restart all

# Check what is running
supervisorctl status

# Reload all configuration files, does not restart services
supervisorctl reread

# Restart all services whose configuration files have changed
supervisorctl update


## Installation on CentOS 7
To install `supervisor`, you need to install `easy_install` and then `supervisor`:

shell
yum -y update
yum -y install python-setuptools
yum -y install supervisor
easy_install supervisor


To verify the installation:
shell
supervisord --version

 
Load the configuration file:
shell
echo_supervisord_conf > /etc/supervisord.conf


Open:
shell
vi /etc/supervisord.conf


Change the log and included folders:
conf
[supervisord]
logfile=/var/log/supervisor/supervisord.log ; main log file

[include]
files = /etc/supervisord.d/*.conf


Script configuration is described on the [Usage](docs/3_page.md) page.

[← Usage](docs/3_page.md) | [↑ Contents](README.md)