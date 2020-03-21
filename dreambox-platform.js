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

    if (api) {
      if (api.version < 2.1) {
        throw new Error('Unexpected API version.');
      }

      // Save the API object as plugin needs to register new accessory via this object
      this.api = api;

      if (config.mqtt) {
        this.mqttClient = new MQTTClient(log, config);
      }

      this.devices.forEach(device => this.accessories.push(new DreamboxAccessory(log, device, this)));

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
    this.log(accessory.displayName, 'Configure Accessory');
    var platform = this;

    // Set the accessory to reachable if plugin can currently process the accessory,
    // otherwise set to false and update the reachability later by invoking
    // accessory.updateReachability()
    accessory.reachable = true;

    accessory.on('identify', (paired, callback) => {
      platform.log(accessory.displayName, 'Identify!!!');
      callback();
    });
  }

  didFinishLaunching() {
    this.log.debug('didFinishLaunching');
  }
}

module.exports = DreamboxPlatform;