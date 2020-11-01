const DreamboxAccessory = require('./dreambox-accessory');
const ChannelAccessory = require('./channel-accessory');
const MQTTClient = require('./mqtt-client');

const PLUGIN_NAME = 'homebridge-dreambox';
const PLATFORM_NAME = 'Dreambox';

class DreamboxPlatform {
  // Platform constructor
  // config may be null
  // api may be null if launched from old homebridge version
  constructor(log, config, api) {
    this.Service = api.hap.Service;
    this.Characteristic = api.hap.Characteristic;
    this.log = log;
    this.config = config || {};
    this.accessories = [];

    if (this.version < 2.1) {
      throw new Error('Unexpected API version.');
    }

    if (api) {
      // Save the API object as plugin needs to register new accessory via this object
      this.api = api;

      // Listen to event "didFinishLaunching", this means homebridge already finished loading cached accessories.
      // Platform Plugin should only register new accessory that doesn't exist in homebridge after this event.
      // Or start discover new accessories.
      this.api.on('didFinishLaunching', () => {
        this.log.debug('didFinishLaunching...');
        if (this.config.mqtt) {
          this.mqttClient = new MQTTClient(this.log, this.config);
        }
        this.setupDevices();
        this.cleanupCache();
      });
    }
  }

  // Function invoked when homebridge tries to restore cached accessory.
  configureAccessory(accessory) {
    this.accessories.push(accessory);
  }

  deviceUUID(device) {
    return this.api.hap.uuid.generate(device.hostname);
  }

  channelUUID(channel) {
    return this.api.hap.uuid.generate(channel.ref);
  }

  setupDevices() {
    if (Array.isArray(this.config.devices)) {
      this.config.devices.forEach(device => {
        const uuid = this.deviceUUID(device);
        const existingDevice = this.accessories.find(a => a.UUID === uuid);
        if (existingDevice) {
          this.log.info('Restoring existing device accessory from cache: %s', device.name);
          existingDevice.context.device = device;
          this.api.updatePlatformAccessories([existingDevice]);
          new DreamboxAccessory(this, existingDevice);
        } else {
          this.log.info('Adding new device accessory: %s', device.name);
          const accessory = new this.api.platformAccessory(device.name, uuid);
          accessory.context.device = device;
          new DreamboxAccessory(this, accessory);
          this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
        }

      });
    }

    if (Array.isArray(this.config.channels)) {
      this.config.channels.forEach(channel => {
        const uuid = this.channelUUID(channel);
        const existingChannel = this.accessories.find(a => a.UUID === uuid);
        if (existingChannel) {
          this.log.info('Restoring existing channel accessory from cache: %s', channel.name);
          existingChannel.context.channel = channel;
          this.api.updatePlatformAccessories([existingChannel]);
          new ChannelAccessory(this, existingChannel);
        } else {
          this.log.info('Adding new channel accessory: %s', channel.name);
          const accessory = new this.api.platformAccessory(channel.name, uuid);
          accessory.context.channel = channel;
          new ChannelAccessory(this, accessory);
          this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
        }
      });
    }
  }

  cleanupCache() {
    this.accessories.forEach(accessory => {
      let foundDevice = false;
      let foundChannel = false;
      if (Array.isArray(this.config.devices)) {
        const found = this.config.devices.find(d => this.deviceUUID(d) === accessory.UUID);
        foundDevice = (found !== undefined);
      }
      if (Array.isArray(this.config.channels)) {
        const found = this.config.channels.find(d => this.channelUUID(d) === accessory.UUID);
        foundChannel = (found !== undefined);
      }
      if (!foundDevice && !foundChannel) {
        this.log.info('Removing unused accessory from cache: %s', accessory.displayName);
        this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      }
    });
  }

}

module.exports = {
  PLUGIN_NAME,
  PLATFORM_NAME,
  DreamboxPlatform
};