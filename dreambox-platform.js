const DreamboxDevice = require('./dreambox-device');

class DreamboxPlatform {
  // Platform constructor
  // config may be null
  // api may be null if launched from old homebridge version
  constructor(log, config, api) {
    this.log = log;
    this.config = config;

    this.log("DreamboxPlatform Init");

    if (this.version < 2.1) {
      throw new Error('Unexpected API version.');
    }

    if (api) {
      // Save the API object as plugin needs to register new accessory via this object
      this.api = api;

      this.accessory = new DreamboxDevice(log, this.config, this.api);

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
    this.log(accessory.displayName, "Configure Accessory");
    var platform = this;

    // Set the accessory to reachable if plugin can currently process the accessory,
    // otherwise set to false and update the reachability later by invoking
    // accessory.updateReachability()
    accessory.reachable = true;

    accessory.on('identify', (paired, callback) => {
      platform.log(accessory.displayName, "Identify!!!");
      callback();
    });
  }

  didFinishLaunching() {
    this.log.debug('didFinishLaunching');
  }
}

module.exports = DreamboxPlatform;