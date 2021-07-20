import { Logger, PlatformConfig } from 'homebridge';
import { MqttClient, connect } from 'mqtt';

type HandlerCallback =
  (topic: string, msg: string) => void;

type Handler = {
  topic: string;
  callback: HandlerCallback;
};

export class MQTTClient {
  private mqttClient: MqttClient;
  private messageHandlers: Array<Handler> = [];

  constructor(private log: Logger, private config: PlatformConfig) {
    const options = {
      clientId: 'homebridge-dreambox_' + Math.random().toString(16).substr(2, 8),
      protocolId: 'MQTT',
      protocolVersion: 4,
      clean: true,
      reconnectPeriod: 30000,
      connectTimeout: 30000,
      username: config.mqttUsername,
      password: config.mqttPassword,
    };

    const broker = config.mqttBroker || 'localhost';
    this.mqttClient = connect('mqtt://' + broker, options);
    this.mqttClient.on('error', err => {
      this.log.error('MQTT Error: %s', err.message);
    });

    this.mqttClient.on('message', (topic, message) => {
      this.log.debug('MQTT Received: %s :- %s', topic, message);
      const handlers = this.messageHandlers.filter(h => h.topic === topic);
      handlers.forEach(h => h.callback(topic, message.toString()));
    });

    this.log.debug('MQTT Client initialized');
  }

  mqttSubscribe(topic: string, callback: HandlerCallback) {
    if (this.mqttClient) {
      this.log.debug('MQTT Subscribed: %s', topic);
      this.messageHandlers.push({ topic, callback });
      const handlersCount = this.messageHandlers.filter(h => h.topic === topic).length;
      if (handlersCount === 1) {
        this.mqttClient.subscribe(topic); // subscribe once
      }
    }
  }
}