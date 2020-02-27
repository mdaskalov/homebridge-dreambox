const fetch = require('node-fetch');
const xml2js = require('xml2js');

var Accessory, Service, Characteristic, UUIDGen;

const responseDelay = 1500;

class DreamboxAccessory {
  constructor(log, config, api) {
    this.log = log;
    this.config = config;
    this.api = api;

    if (config === undefined || config === null)
      return;

    this.name = config['name'];
    this.hostname = config['hostname'];
    this.bouquet = config['bouquet'] || 'favourites';

    this.powerState = false;
    this.muteState = false;
    this.volumeState = 0;
    this.channel = 0;
    this.channelReferences = [];

    this.log('Initializing Dreambox TV-device: ' + this.name);

    // Accessory must be created from PlatformAccessory Constructor
    Accessory = this.api.platformAccessory;

    // Service and Characteristic are from hap-nodejs
    Service = this.api.hap.Service;
    Characteristic = this.api.hap.Characteristic;
    UUIDGen = this.api.hap.uuid;

    // Device Info
    this.manufacturer = 'Dream Multimedia';
    this.modelName = 'homebridge-dreambox';
    this.serialNumber = this.hostname;
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
      .on('set', (channel, callback) => {
        this.setChannel(callback, channel);
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

  callEnigmaWebAPI(path) {
    return new Promise((resolve, reject) => {
      const url = 'http://' + encodeURIComponent(this.hostname) + '/web/' + path;
      this.log.debug('callEnigmaWebAPI: %s', url);
      fetch(url)
        .then(res => res.text())
        .then(body => xml2js.parseStringPromise(body, {
          explicitArray: false
        }))
        .then(res => {
          this.log.debug('callEnigmaWebAPI response: ' + JSON.stringify(res, null, 2));
          resolve(res);
        })
        .catch(err => reject(err));
    });
  }

  prepareTvInputServices() {
    this.log('prepareTvInputServices');
    this.callEnigmaWebAPI('getallservices')
      .then(res => {
        if (res.e2servicelistrecursive && res.e2servicelistrecursive.e2bouquet) {
          let bouquet = res.e2servicelistrecursive.e2bouquet.find(b => b.e2servicename === this.bouquet)
          if (bouquet) {
            var channel = 0;
            bouquet.e2servicelist.e2service.forEach(service => {
              const channelName = String(channel + 1).padStart(2, '0') + '. ' + service.e2servicename;
              const channelReference = service.e2servicereference;
              if (channel < 97 && !channelReference.startsWith('1:64:')) { // Max 97 channels can be used, skip markers
                this.createInputSource(channelReference, channelName, channel);
                this.channelReferences.push(channelReference);
                channel++;
              }
            });
            this.log('Device: %s, %s channel(s) configured', this.hostname, this.channelReferences.length);
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
        this.log('Device: %s, saved new channel successfull, name: %s, reference: %s', this.hostname, name, reference);
        callback();
      });

    this.tvAccesory.addService(input);
    if (!input.linked)
      this.tvService.addLinkedService(input);
  }

  getPowerState(callback) {
    this.callEnigmaWebAPI('powerstate')
      .then(res => {
        if (res.e2powerstate && res.e2powerstate.e2instandby) {
          this.powerState = res.e2powerstate.e2instandby === 'false';
          this.log('Device: %s, getPowerState: %s', this.hostname, this.powerState ? 'ON' : 'STANDBY');
          callback(null, this.powerState);
        }
      })
      .catch(err => callback(err));
  }

  setPowerState(state, callback) {
    this.powerState = state;
    this.log('Device: %s, setPowerState: %s', this.hostname, state ? 'ON' : 'STANDBY');
    this.callEnigmaWebAPI('powerstate?newstate=' + (state ? '4' : '5'))
      .then(callback(null, state))
      .catch(err => callback(err));
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
    if (this.powerState) {
      this.callEnigmaWebAPI('getcurrent')
        .then(res => {
          if (res.e2currentserviceinformation && res.e2currentserviceinformation.e2service) {
            const reference = res.e2currentserviceinformation.e2service.e2servicereference;
            const channel = this.channelReferences.indexOf(reference);
            if (channel != -1) {
              this.log('Device: %s, getChannel: %s, (%s)', this.hostname, channel, reference);
              this.channel = channel;
            }
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

  setChannel(callback, channel) {
    this.channel = channel;
    this.log('Device: %s, setChannel: %s', this.hostname, channel);
    this.callEnigmaWebAPI('zap?sRef=' + encodeURIComponent(this.channelReferences[this.channel]))
      .then(callback(null, channel))
      .catch(err => callback(err));
  }

  setPowerMode(state, callback) {
    this.log('Device: %s, set new Power Mode successfull, state: %s', this.hostname, state);
    callback(null, state);
  }

  volumeSelectorPress(remoteKey, callback) {
    const commands = new Map([
      [Characteristic.VolumeSelector.INCREMENT, 'up'],
      [Characteristic.VolumeSelector.DECREMENT, 'down'],
    ]);
    const command = commands.get(remoteKey) || '';
    this.log('Device: %s, volumeSelectorPress: %s, command: %s', this.hostname, remoteKey, command);
    this.callEnigmaWebAPI('vol?set=' + command)
      .then(callback(null, remoteKey))
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
    this.log('Device: %s, remoteKeyPress: %s, command: %s', this.hostname, remoteKey, command);
    this.callEnigmaWebAPI('remotecontrol?command=' + command)
      .then(callback(null, remoteKey))
      .catch(err => callback(err));
  }
}

module.exports = DreamboxAccessory;