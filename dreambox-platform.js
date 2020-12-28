const DreamboxAccessory = require('./dreambox-accessory');
const ChannelAccessory = require('./channel-accessory');
const Dreambox = require('./dreambox');
const MQTTClient = require('./mqtt-client');
const {
  PLUGIN_NAME,
  PLATFORM_NAME
} = require('./settings');

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

  static pluginName() {
    return 'XX';
  }

  // Function invoked when homebridge tries to restore cached accessory.
  configureAccessory(accessory) {
    this.accessories.push(accessory);
  }

  channelUUID(channel) {
    return this.api.hap.uuid.generate(channel.name + channel.ref);
  }

  setupDevices() {
    if (Array.isArray(this.config.devices)) {
      this.config.devices.forEach(device => {
        const dreambox = new Dreambox(this, device);
        new DreamboxAccessory(this, dreambox);
        if (Array.isArray(device.channels)) {
          device.channels.forEach(channel => {
            const uuid = this.channelUUID(channel);
            const existingChannel = this.accessories.find(a => a.UUID === uuid);
            if (existingChannel) {
              this.log.info('Restoring existing channel accessory from cache: %s', channel.name);
              existingChannel.context.channel = channel;
              this.api.updatePlatformAccessories([existingChannel]);
              new ChannelAccessory(this, existingChannel, dreambox);
            } else {
              this.log.info('Adding new channel accessory: %s', channel.name);
              const accessory = new this.api.platformAccessory(channel.name, uuid);
              accessory.context.channel = channel;
              new ChannelAccessory(this, accessory, dreambox);
              this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
            }
          });
        }
      });
    }
  }

  uuidUsed(uuid) {
    var used = false;
    if (Array.isArray(this.config.devices)) {
      this.config.devices.forEach(device => {
        if (Array.isArray(device.channels)) {
          device.channels.forEach(channel => {
            if (this.channelUUID(channel) === uuid) {
              used = true;
            }
          });
        }
      });
    }
    return used;
  }

  cleanupCache() {
    this.log.debug('CleanupCache...');
    this.accessories.forEach(accessory => {
      this.log.debug('Accessory UUID:', accessory.UUID, 'Name:', accessory.displayName);
      if (!this.uuidUsed(accessory.UUID)) {
        this.log.info('Removing unused accessory from cache: %s', accessory.displayName);
        this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      }
    });
  }

}

module.exports = DreamboxPlatform;