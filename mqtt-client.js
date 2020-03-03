const mqtt = require('mqtt');

class MQTTClient {
    constructor(log, config) {
        this.log = log;
        this.config = config;

        this.config.name = 'dream';
        this.config.url = 'mqtt://raspi2:1883';

        this.mqttDispatch = [];

        this.log('MQTT Client created');

        this.mqttClient = this.mqttInit();
    }

    mqttInit() {
        var clientId = 'dreambox_' + this.config.name.replace(/[^\x20-\x7F]/g, '') + '_' + Math.random().toString(16).substr(2, 8);

        var options = {
            keepalive: 10,
            clientId: clientId,
            protocolId: 'MQTT',
            protocolVersion: 4,
            clean: true,
            reconnectPeriod: 1000,
            connectTimeout: 30 * 1000,
            will: {
                topic: 'WillMsg',
                payload: 'Connection Closed abnormally..!',
                qos: 0,
                retain: false
            },
            // username: this.config.username,
            // password: this.config.password,
            rejectUnauthorized: false
        };

        var mqttClient = mqtt.connect(this.config.url, options);
        mqttClient.on('error', function (err) {
            this.log('MQTT Error: ' + err);
        });

        mqttClient.on('message', (topic, message) => {
            this.log.debug('Received MQTT: ' + topic + ' = ' + message);
            var handlers = this.mqttDispatch[topic];
            if (handlers) {
                handlers.forEach(handler => handler(topic, message));
            } else {
                this.log('Warning: No MQTT dispatch handler for topic [' + topic + ']');
            }
        });

        return mqttClient;
    }

    mqttSubscribe(topic, handler) {
        this.log.debug('MQTT subscribed ' + topic);
        this.mqttDispatch[topic] = [handler];
        this.mqttClient.subscribe(topic);
    }
}

module.exports = MQTTClient;