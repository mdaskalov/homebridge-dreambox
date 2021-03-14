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
  private mqttDispatch: Array<Handler> = [];

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
      const handlers = this.mqttDispatch[topic];
      if (handlers) {
        handlers.forEach(handler => handler(topic, message));
      } else {
        this.log.warn('Warning: No MQTT dispatch handler for topic [' + topic + ']');
      }
    });

    this.log.debug('MQTT Client initialized');
  }

  mqttSubscribe(topic: string, handler: Handler) {
    if (this.mqttClient) {
      this.log.debug('MQTT Subscribed: %s', topic);
      this.mqttDispatch[topic] = [handler];
      this.mqttClient.subscribe(topic);
    }
  }
}