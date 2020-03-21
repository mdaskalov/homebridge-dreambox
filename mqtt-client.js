const mqtt = require('mqtt');

class MQTTClient {
    constructor(log, config) {
        this.log = log;
        this.mqttDispatch = [];

        var options = {
            clientId: 'homebridge-dreambox_' + Math.random().toString(16).substr(2, 8),
            protocolId: 'MQTT',
            protocolVersion: 4,
            clean: true,
            reconnectPeriod: 30000,
            connectTimeout: 30000,
            username: config.mqttUsername,
            password: config.mqttPassword
        };

        let broker = config.mqttBroker || 'localhost';
        this.mqttClient = mqtt.connect('mqtt://' + broker, options);
        this.mqttClient.on('error', err => {
            this.log.error('MQTT Error: %s', err.message);
        });

        this.mqttClient.on('message', (topic, message) => {
            this.log.debug('MQTT Received: %s :- %s', topic, message);
            var handlers = this.mqttDispatch[topic];
            if (handlers) {
                handlers.forEach(handler => handler(topic, message));
            } else {
                this.log.warn('Warning: No MQTT dispatch handler for topic [' + topic + ']');
            }
        });

        this.log('MQTT Client initialized');
    }

    mqttSubscribe(topic, handler) {
        if (this.mqttClient) {
            this.log.debug('MQTT Subscribed: %s', topic);
            this.mqttDispatch[topic] = [handler];
            this.mqttClient.subscribe(topic);
        }
    }
}

module.exports = MQTTClient;