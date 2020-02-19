var Accessory, Service, Characteristic, UUIDGen;

const responseDelay = 1500;

class DreamboxDevice {
  constructor(log, config, api) {
    this.log = log;
    this.config = config;
    this.api = api;

    if (config === undefined || config === null)
      return;

    this.name = config["name"] || 'Dreambox';
    this.hostname = config["hostname"] || 'dreambox';

    this.powerState = false;
    this.muteState = false;
    this.volumeState = 0;
    this.channelReference = 0;

    this.log("Initializing Dreambox TV-device")

    // Accessory must be created from PlatformAccessory Constructor
    Accessory = this.api.platformAccessory;

    // Service and Characteristic are from hap-nodejs
    Service = this.api.hap.Service;
    Characteristic = this.api.hap.Characteristic;
    UUIDGen = this.api.hap.uuid;

    // Device Info
    this.manufacturer = 'Dream Multimedia';
    this.modelName = 'homebridge-dreambox';
    this.serialNumber = 'SN000123';
    this.firmwareRevision = 'FW000345';

    setTimeout(this.prepareTvService.bind(this), responseDelay);

    var deviceName = this.name;
    var uuid = UUIDGen.generate(deviceName);
    this.tvAccesory = new Accessory(deviceName, uuid, this.api.hap.Accessory.Categories.TV);
    this.log('Device: %s, publishExternalAccessories: %s', this.hostname, this.name);
    this.api.publishExternalAccessories('homebridge-dreambox', [this.tvAccesory]);
  }

  //Prepare TV service
  prepareTvService() {
    this.log('prepareTvService');
    this.tvService = new Service.Television(this.name, 'tvService');
    this.tvService.setCharacteristic(Characteristic.ConfiguredName, this.name);
    this.tvService.setCharacteristic(Characteristic.SleepDiscoveryMode, Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE);

    this.tvService.getCharacteristic(Characteristic.Active)
      .on('get', this.getPowerState.bind(this))
      .on('set', this.setPowerState.bind(this));

    this.tvService.getCharacteristic(Characteristic.ActiveIdentifier)
      .on('get', this.getChannel.bind(this))
      .on('set', (inputIdentifier, callback) => {
        this.setChannel(callback, this.channelReferences[inputIdentifier]);
      });

    this.tvService.getCharacteristic(Characteristic.RemoteKey)
      .on('set', this.remoteKeyPress.bind(this));

    this.tvService.getCharacteristic(Characteristic.PowerModeSelection)
      .on('set', this.setPowerMode.bind(this));

    this.tvAccesory
      .getService(Service.AccessoryInformation)
      .setCharacteristic(Characteristic.Manufacturer, this.manufacturer)
      .setCharacteristic(Characteristic.Model, this.modelName)
      .setCharacteristic(Characteristic.SerialNumber, this.serialNumber)
      .setCharacteristic(Characteristic.FirmwareRevision, this.firmwareRevision);

    this.tvAccesory.addService(this.tvService);
    this.prepereTvSpeakerService();
    this.prepareTvInputServices();
  }

  //Prepare speaker service
  prepereTvSpeakerService() {
    this.log('prepereTvSpeakerService');
    this.tvSpeakerService = new Service.TelevisionSpeaker(this.name, 'tvSpeakerService');
    this.tvSpeakerService
      .setCharacteristic(Characteristic.Active, Characteristic.Active.ACTIVE)
      .setCharacteristic(Characteristic.VolumeControlType, Characteristic.VolumeControlType.ABSOLUTE);
    this.tvSpeakerService.getCharacteristic(Characteristic.VolumeSelector)
      .on('set', this.volumeSelectorPress.bind(this));
    this.tvSpeakerService.getCharacteristic(Characteristic.Volume)
      .on('get', this.getVolume.bind(this))
      .on('set', this.setVolume.bind(this));
    this.tvSpeakerService.getCharacteristic(Characteristic.Mute)
      .on('get', this.getMute.bind(this))
      .on('set', this.setMute.bind(this));

    this.tvAccesory.addService(this.tvSpeakerService);
    this.tvService.addLinkedService(this.tvSpeakerService);
  }

  prepareTvInputServices() {
    this.log('prepareTvInputServices');
    this.createInputSource("source1", "TV Input 1", 1);
    this.createInputSource("source2", "TV Input 2", 2);
  }

  createInputSource(reference, name, number, type = Characteristic.InputSourceType.TV) {
    var input = new Service.InputSource(reference, name);
    input
      .setCharacteristic(Characteristic.Identifier, number)
      .setCharacteristic(Characteristic.ConfiguredName, name)
      .setCharacteristic(Characteristic.IsConfigured, Characteristic.IsConfigured.CONFIGURED)
      .setCharacteristic(Characteristic.InputSourceType, type)
      .setCharacteristic(Characteristic.CurrentVisibilityState, Characteristic.CurrentVisibilityState.SHOWN);

    input
      .getCharacteristic(Characteristic.ConfiguredName)
      .on('set', (name, callback) => {
        this.log('Device: %s, saved new channel successfull, name: %s, reference: %s', this.host, name, reference);
        callback()
      });

    this.tvAccesory.addService(input);
    if (!input.linked)
      this.tvService.addLinkedService(input);
  }

  getPowerState(callback) {
    this.log('Device: %s, get current Power state successfull: %s', this.hostname, this.powerState ? 'ON' : 'STANDBY');
    callback(null, this.powerState);
  }

  setPowerState(state, callback) {
    this.powerState = state;
    this.log('Device: %s, set new Power state successfull: %s', this.hostname, this.powerState ? 'ON' : 'STANDBY');
    callback(null, state);
  }

  getMute(callback) {
    this.log('Device: %s, get current Mute state successfull: %s', this.hostname, this.muteState ? 'ON' : 'OFF');
    callback(null, this.muteState);
  }

  setMute(state, callback) {
    this.muteState = state;
    this.log('Device: %s, set new Mute state successfull: %s', this.hostname, this.muteState ? 'ON' : 'OFF');
    callback(null, this.muteState);
  }

  getVolume(callback) {
    this.log('Device: %s, get current Volume level successfull: %s', this.hostname, this.volumeState);
    callback(null, this.volumeState);
  }

  setVolume(volume, callback) {
    this.volumeState = volume;
    this.log('Device: %s, set new Volume level successfull: %s', this.hostname, this.volumeState);
    callback(null, this.volumeState);
  }

  getChannel(callback) {
    this.log('Device: %s, get current Channel successfull: %s', this.hostname, this.channelReference);
    callback(null, this.channelReference);
  }

  setChannel(callback, channelReference) {
    this.channelReference = channelReference;
    this.log('Device: %s, set new Channel successfull: %s', me.hostname, this.channelReference);
    callback(null, this.channelReference);
  }

  setPowerMode(callback, state) {
    this.log('Device: %s, set new Power Mode successfull, state: %s', me.host, state);
    callback(null, state);
  }

  volumeSelectorPress(remoteKey, callback) {
    var command = 0;
    switch (remoteKey) {
      case Characteristic.VolumeSelector.INCREMENT:
        command = 'UP';
        break;
      case Characteristic.VolumeSelector.DECREMENT:
        command = 'DOWN';
        break;
    }
    this.log('Device: %s, key prssed: %s, command: %s', this.hostname, remoteKey, command);
    callback(null, remoteKey);
  }

  remoteKeyPress(remoteKey, callback) {
    var command = 0;
    switch (remoteKey) {
      case Characteristic.RemoteKey.REWIND:
        command = '168';
        break;
      case Characteristic.RemoteKey.FAST_FORWARD:
        command = '159';
        break;
      case Characteristic.RemoteKey.NEXT_TRACK:
        command = '407';
        break;
      case Characteristic.RemoteKey.PREVIOUS_TRACK:
        command = '412';
        break;
      case Characteristic.RemoteKey.ARROW_UP:
        command = '103';
        break;
      case Characteristic.RemoteKey.ARROW_DOWN:
        command = '108';
        break;
      case Characteristic.RemoteKey.ARROW_LEFT:
        command = '105';
        break;
      case Characteristic.RemoteKey.ARROW_RIGHT:
        command = '106';
        break;
      case Characteristic.RemoteKey.SELECT:
        command = '352';
        break;
      case Characteristic.RemoteKey.BACK:
        command = '174';
        break;
      case Characteristic.RemoteKey.EXIT:
        command = '174';
        break;
      case Characteristic.RemoteKey.PLAY_PAUSE:
        command = '164';
        break;
      case Characteristic.RemoteKey.INFORMATION:
        command = '139';
        break;
    }
    this.log('Device: %s, key prssed: %s, command: %s', me.hostname, remoteKey, command);
    callback(null, remoteKey);
  }

};

module.exports = DreamboxDevice;