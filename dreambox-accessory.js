var Accessory, Service, Characteristic;

const responseDelay = 1500;

class DreamboxAccessory {
  constructor(platform, dreambox) {
    this.platform = platform;
    this.log = platform.log;

    this.dreambox = dreambox;

    this.log.debug('Configuring %s as external TV accessory %s', this.dreambox.hostname, this.dreambox.name);

    // Accessory must be created from PlatformAccessory Constructor
    Accessory = platform.api.platformAccessory;

    // Service and Characteristic are from hap-nodejs
    Service = platform.api.hap.Service;
    Characteristic = platform.api.hap.Characteristic;

    setTimeout(this.prepareTvService.bind(this), responseDelay);

    this.tvAccesory = new Accessory(this.dreambox.name, this.dreambox.uuid, platform.api.hap.Accessory.Categories.TV);
    this.log.debug('Device: %s, publishExternalAccessories: %s', this.dreambox.hostname, this.dreambox.name);
    platform.api.publishExternalAccessories('homebridge-dreambox', [this.tvAccesory]);
  }

  //Prepare TV service
  prepareTvService() {
    this.log.debug('Device: %s, prepareTvService', this.dreambox.hostname);

    this.tvAccesory
      .getService(Service.AccessoryInformation)
      .setCharacteristic(Characteristic.Manufacturer, this.dreambox.manufacturer)
      .setCharacteristic(Characteristic.Model, this.dreambox.modelName)
      .setCharacteristic(Characteristic.SerialNumber, this.dreambox.serialNumber)
      .setCharacteristic(Characteristic.FirmwareRevision, this.dreambox.firmwareRevision);

    this.tvService = new Service.Television(this.dreambox.name, 'tvService');
    this.tvService.setCharacteristic(Characteristic.ConfiguredName, this.dreambox.name);
    this.tvService.setCharacteristic(Characteristic.SleepDiscoveryMode, Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE);

    this.tvService.getCharacteristic(Characteristic.Active)
      .on('get', this.dreambox.getPowerState.bind(this.dreambox))
      .on('set', this.dreambox.setPowerState.bind(this.dreambox));

    this.tvService.getCharacteristic(Characteristic.ActiveIdentifier)
      .on('get', this.dreambox.getChannel.bind(this.dreambox))
      .on('set', this.dreambox.setChannel.bind(this.dreambox));

    this.tvService.getCharacteristic(Characteristic.RemoteKey)
      .on('set', this.remoteKeyPress.bind(this));

    this.tvService.getCharacteristic(Characteristic.PowerModeSelection)
      .on('set', this.dreambox.setPowerMode.bind(this.dreambox));

    this.dreambox.setMQTTPowerHandler((power) => {
      this.tvService.updateCharacteristic(Characteristic.Active, power);
    });

    this.dreambox.setMQTTChannelHandler((channel) => {
      this.tvService.updateCharacteristic(Characteristic.ActiveIdentifier, channel);
    });

    this.tvAccesory.addService(this.tvService);
    this.prepereTvSpeakerService();
    this.prepareTvInputServices();
  }

  //Prepare speaker service
  prepereTvSpeakerService() {
    this.log.debug('Device: %s, prepereTvSpeakerService', this.dreambox.hostname);
    this.tvSpeakerService = new Service.TelevisionSpeaker(this.dreambox.name, 'tvSpeakerService');
    this.tvSpeakerService
      .setCharacteristic(Characteristic.Active, Characteristic.Active.ACTIVE)
      .setCharacteristic(Characteristic.VolumeControlType, Characteristic.VolumeControlType.ABSOLUTE);
    this.tvSpeakerService.getCharacteristic(Characteristic.VolumeSelector)
      .on('set', this.volumeSelectorPress.bind(this));
    this.tvSpeakerService.getCharacteristic(Characteristic.Volume)
      .on('get', this.dreambox.getVolume.bind(this.dreambox))
      .on('set', this.dreambox.setVolume.bind(this.dreambox));
    this.tvSpeakerService.getCharacteristic(Characteristic.Mute)
      .on('get', this.dreambox.getMute.bind(this.dreambox))
      .on('set', this.dreambox.setMute.bind(this.dreambox));

    this.tvAccesory.addService(this.tvSpeakerService);
    this.tvService.addLinkedService(this.tvSpeakerService);
  }

  prepareTvInputServices() {
    this.log.debug('Device: %s, prepareTvInputServices', this.dreambox.hostname);
    this.dreambox.getAllChannels()
      .then(channels => {
        var channel = 0;
        channels.forEach(ch => {
          const channelName = String(channel + 1).padStart(2, '0') + '. ' + ch.name;
          const channelReference = ch.reference;
          if (channel < 97) { // Max 97 channels can be used
            this.createInputSource(channelReference, channelName, channel);
            channel++;
          }
        });
      })
      .catch(err => this.log(err));
  }

  createInputSource(reference, name, number, sourceType = Characteristic.InputSourceType.HDMI, deviceType = Characteristic.InputDeviceType.TV) {
    var input = new Service.InputSource(reference, name);
    input
      .setCharacteristic(Characteristic.Identifier, number)
      .setCharacteristic(Characteristic.ConfiguredName, name)
      .setCharacteristic(Characteristic.IsConfigured, Characteristic.IsConfigured.CONFIGURED)
      .setCharacteristic(Characteristic.InputSourceType, sourceType)
      .setCharacteristic(Characteristic.InputDeviceType, deviceType)
      .setCharacteristic(Characteristic.CurrentVisibilityState, Characteristic.CurrentVisibilityState.SHOWN);

    input
      .getCharacteristic(Characteristic.ConfiguredName)
      .on('set', (name, callback) => {
        this.log.debug('Device: %s, saved new channel successfull, name: %s, reference: %s', this.dreambox.hostname, name, reference);
        callback();
      });

    this.tvAccesory.addService(input);
    if (!input.linked)
      this.tvService.addLinkedService(input);
  }

  volumeSelectorPress(remoteKey, callback) {
    const commands = new Map([
      [Characteristic.VolumeSelector.INCREMENT, 'up'],
      [Characteristic.VolumeSelector.DECREMENT, 'down'],
    ]);
    const command = commands.get(remoteKey) || '';
    this.dreambox.volumeSelectorPress(remoteKey, command, callback);
  }

  remoteKeyPress(remoteKey, callback) {
    const commands = new Map([
      [Characteristic.RemoteKey.REWIND, 168],
      [Characteristic.RemoteKey.FAST_FORWARD, 159],
      [Characteristic.RemoteKey.NEXT_TRACK, 407],
      [Characteristic.RemoteKey.PREVIOUS_TRACK, 412],
      [Characteristic.RemoteKey.ARROW_UP, 103],
      [Characteristic.RemoteKey.ARROW_DOWN, 108],
      [Characteristic.RemoteKey.ARROW_LEFT, 105],
      [Characteristic.RemoteKey.ARROW_RIGHT, 106],
      [Characteristic.RemoteKey.SELECT, 352],
      [Characteristic.RemoteKey.BACK, 174],
      [Characteristic.RemoteKey.EXIT, 174],
      [Characteristic.RemoteKey.PLAY_PAUSE, 139],
      [Characteristic.RemoteKey.INFORMATION, 358],
    ]);
    const command = commands.get(remoteKey) || 0;
    this.dreambox.remoteKeyPress(remoteKey, command, callback);
  }
}

module.exports = DreamboxAccessory;