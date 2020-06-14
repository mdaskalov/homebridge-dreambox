const DreamboxAccessory = require('./dreambox-accessory');
const MQTTClient = require('./mqtt-client');

class DreamboxPlatform {
  // Platform constructor
  // config may be null
  // api may be null if launched from old homebridge version
  constructor(log, config, api) {
    this.log = log;
    this.config = config || {};
    this.devices = this.config.devices || [];
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
      this.api.on('didFinishLaunching', this.didFinishLaunching.bind(this));
    }
  }

  // Function invoked when homebridge tries to restore cached accessory.
  // Developer can configure accessory at here (like setup event handler).
  // Update current value.
  configureAccessory(accessory) {
    this.log.debug('configureAccessory');

    // Set the accessory to reachable if plugin can currently process the accessory,
    // otherwise set to false and update the reachability later by invoking
    // accessory.updateReachability()
    // accessory.reachable = true;

    accessory.on('identify', (paired, callback) => {
      this.log(accessory.displayName, 'Identify!!!');
      callback();
    });

    this.accessories.push(accessory);
  }

  removeAccessory(accessory) {
    this.log.debug('removeAccessory');
    this.api.unregisterPlatformAccessories('homebridge-dreambox', 'Dreambox', [accessory]);
  }

  didFinishLaunching() {
    this.log.debug('didFinishLaunching');
    if (this.config.mqtt) {
      this.mqttClient = new MQTTClient(this.log, this.config);
    }
    this.devices.forEach(device => {
      this.accessories.push(new DreamboxAccessory(this.log, device, this));
    });
  }
}

module.exports = DreamboxPlatform;