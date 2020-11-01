var Accessory, Service, Characteristic;

const responseDelay = 1500;

class DreamboxAccessory {
  constructor(platform, dreambox) {
    this.platform = platform;
    this.log = platform.log;

    this.dreambox = dreambox;

    this.powerState = false;
    this.muteState = false;
    this.volumeState = 0;
    this.channel = 0;
    this.channels = [];

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

  getMuteString() {
    return this.muteState ? 'ON' : 'OFF';
  }

  getPowerStateString() {
    return this.powerState ? 'ON' : 'STANDBY';
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
      .on('get', this.getPowerState.bind(this))
      .on('set', this.setPowerState.bind(this));

    this.tvService.getCharacteristic(Characteristic.ActiveIdentifier)
      .on('get', this.getChannel.bind(this))
      .on('set', this.setChannel.bind(this));

    this.tvService.getCharacteristic(Characteristic.RemoteKey)
      .on('set', this.remoteKeyPress.bind(this));

    this.tvService.getCharacteristic(Characteristic.PowerModeSelection)
      .on('set', this.setPowerMode.bind(this));

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
      .on('get', this.getVolume.bind(this))
      .on('set', this.setVolume.bind(this));
    this.tvSpeakerService.getCharacteristic(Characteristic.Mute)
      .on('get', this.getMute.bind(this))
      .on('set', this.setMute.bind(this));

    this.tvAccesory.addService(this.tvSpeakerService);
    this.tvService.addLinkedService(this.tvSpeakerService);
  }

  prepareTvInputServices() {
    this.log.debug('Device: %s, prepareTvInputServices', this.dreambox.hostname);
    this.dreambox.callEnigmaWebAPI('getallservices')
      .then(res => {
        if (res && res.e2servicelistrecursive && res.e2servicelistrecursive.e2bouquet) {
          let bouquet = res.e2servicelistrecursive.e2bouquet;
          if (Array.isArray(bouquet)) {
            bouquet = bouquet.find(b => b.e2servicename === this.bouquet);
          }
          if (bouquet) {
            var channel = 0;
            bouquet.e2servicelist.e2service.forEach(service => {
              const channelName = String(channel + 1).padStart(2, '0') + '. ' + service.e2servicename;
              const channelReference = service.e2servicereference;
              if (channel < 97 && !channelReference.startsWith('1:64:')) { // Max 97 channels can be used, skip markers
                this.createInputSource(channelReference, channelName, channel);
                this.channels.push({
                  name: service.e2servicename,
                  reference: channelReference
                });
                channel++;
              }
            });
            this.log.info('Device: %s, configured %d channel(s)', this.dreambox.hostname, this.channels.length);
          }
        }
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

  getPowerState(callback) {
    this.dreambox.callEnigmaWebAPI('powerstate')
      .then(res => {
        if (res && res.e2powerstate && res.e2powerstate.e2instandby) {
          this.powerState = res.e2powerstate.e2instandby === 'false';
          this.log.debug('Device: %s, getPower: %s', this.dreambox.hostname, this.getPowerStateString());
          callback(null, this.powerState);
        }
      })
      .catch(err => callback(err));
  }

  setPowerState(state, callback) {
    this.powerState = state;
    this.log.debug('Device: %s, setPower: %s', this.dreambox.hostname, this.getPowerStateString());
    this.dreambox.callEnigmaWebAPI('powerstate', {
        newstate: (state ? '4' : '5')
      })
      .then(() => callback(null, state))
      .catch(err => callback(err));
  }

  getMute(callback) {
    this.log.debug('Device: %s, getMute: %s', this.dreambox.hostname, this.getMuteString());
    callback(null, this.muteState);
  }

  setMute(state, callback) {
    this.muteState = state;
    this.log.debug('Device: %s, setMute: %s', this.dreambox.hostname, this.getMuteString());
    callback(null, this.muteState);
  }

  getVolume(callback) {
    this.log.debug('Device: %s, getVolume: %s', this.dreambox.hostname, this.volumeState);
    callback(null, this.volumeState);
  }

  setVolume(volume, callback) {
    this.volumeState = volume;
    this.log.debug('Device: %s, setVolume: %s', this.dreambox.hostname, this.volumeState);
    callback(null, this.volumeState);
  }

  getChannel(callback) {
    if (this.powerState) {
      this.dreambox.callEnigmaWebAPI('getcurrent')
        .then(res => {
          if (res && res.e2currentserviceinformation && res.e2currentserviceinformation.e2service) {
            const reference = res.e2currentserviceinformation.e2service.e2servicereference;
            this.channels.find((channel, index) => {
              if (channel.reference === reference) {
                this.log.debug('Device: %s, getChannel: %s :- %s (%s)', this.dreambox.hostname, index, channel.name, channel.reference);
                this.channel = index;
                return true;
              }
            });
          }
          callback(null, this.channel);
        })
        .catch(err => {
          this.log(err);
          callback(err);
        });
    } else
      callback(null, this.channel);
  }

  setChannel(channel, callback) {
    this.channel = channel;
    this.log.debug('Device: %s, setChannel: %s', this.dreambox.hostname, channel);
    this.dreambox.callEnigmaWebAPI('zap', {
        sRef: this.channels[this.channel].reference
      })
      .then(() => callback(null, channel))
      .catch(err => callback(err));
  }

  setPowerMode(state, callback) {
    this.powerState = state;
    this.log.debug('Device: %s, setPowerMode: %s', this.dreambox.hostname, this.getPowerStateString());
    callback(null, state);
  }

  volumeSelectorPress(remoteKey, callback) {
    const commands = new Map([
      [Characteristic.VolumeSelector.INCREMENT, 'up'],
      [Characteristic.VolumeSelector.DECREMENT, 'down'],
    ]);
    const command = commands.get(remoteKey) || '';
    this.log.debug('Device: %s, volumeSelectorPress: %s, command: %s', this.dreambox.hostname, remoteKey, command);
    this.dreambox.callEnigmaWebAPI('vol', {
        set: command
      })
      .then(() => callback(null, remoteKey))
      .catch(err => callback(err));
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
    this.log.debug('Device: %s, remoteKeyPress: %s, command: %s', this.dreambox.hostname, remoteKey, command);
    this.dreambox.callEnigmaWebAPI('remotecontrol', {
        command: command
      })
      .then(() => callback(null, remoteKey))
      .catch(err => callback(err));
  }
}

module.exports = DreamboxAccessory;