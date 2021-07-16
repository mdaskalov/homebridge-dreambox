import { PlatformAccessory, Characteristic, Service } from 'homebridge';
import { DreamboxPlatform } from './platform';
import { Dreambox } from './dreambox';
import { PLUGIN_NAME } from './settings';

export class DreamboxAccessory {
  private tvAccessory: PlatformAccessory;
  private tvService: Service;

  constructor(protected readonly platform: DreamboxPlatform, protected readonly dreambox: Dreambox) {

    this.platform.log.debug('Configuring %s as external TV accessory %s', this.dreambox.hostname, this.dreambox.name);

    this.tvAccessory = new this.platform.api.platformAccessory(this.dreambox.name, this.dreambox.uuid);
    switch (platform.config.deviceType) {
      case 'AUDIO_RECEIVER':
        this.tvAccessory.category = platform.api.hap.Categories.AUDIO_RECEIVER;
        break;
      case 'TELEVISION':
        this.tvAccessory.category = platform.api.hap.Categories.TELEVISION;
        break;
      case 'TV_STREAMING_STICK':
        this.tvAccessory.category = platform.api.hap.Categories.TV_STREAMING_STICK;
        break;
      default:
        this.tvAccessory.category = platform.api.hap.Categories.TV_SET_TOP_BOX;
        break;
    }

    this.tvService = this.prepareTvService();
    this.prepereTvSpeakerService();
    this.prepareTvInputServices()
      .then(channels => {
        this.platform.log.debug('Device: %s, prepared %s channels.', this.dreambox.hostname, channels);
        this.dreambox.getDeviceInfo((err, res) => {
          if (err) {
            this.platform.log.error(err);
          } else if (this.tvAccessory !== undefined) {
            this.tvAccessory
              .getService(this.platform.Service.AccessoryInformation)!
              .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Dream Multimedia')
              .setCharacteristic(this.platform.Characteristic.Model, res.modelName)
              .setCharacteristic(this.platform.Characteristic.SerialNumber, res.serialNumber)
              .setCharacteristic(this.platform.Characteristic.FirmwareRevision, res.firmwareRevision);
            this.platform.log.debug('Device: %s, publishExternalAccessories: %s', this.dreambox.hostname, this.dreambox.name);
            platform.api.publishExternalAccessories(PLUGIN_NAME, [this.tvAccessory]);
          }
        });
      })
      .catch(err => this.platform.log.error(err));
  }

  //Prepare TV service
  prepareTvService(): Service {
    this.platform.log.debug('Device: %s, prepareTvService', this.dreambox.hostname);

    const tvService = this.tvAccessory.addService(this.platform.Service.Television);
    tvService.setCharacteristic(this.platform.Characteristic.ConfiguredName, this.dreambox.name);
    tvService.setCharacteristic(this.platform.Characteristic.SleepDiscoveryMode, this.platform.Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE);

    tvService.getCharacteristic(this.platform.Characteristic.Active)
      .on('get', this.dreambox.getPowerState.bind(this.dreambox))
      .on('set', this.dreambox.setPowerState.bind(this.dreambox));

    tvService.getCharacteristic(this.platform.Characteristic.ActiveIdentifier)
      .on('get', this.dreambox.getChannel.bind(this.dreambox))
      .on('set', this.dreambox.setChannel.bind(this.dreambox));

    tvService.getCharacteristic(this.platform.Characteristic.RemoteKey)
      .on('set', this.remoteKeyPress.bind(this));

    tvService.getCharacteristic(this.platform.Characteristic.PowerModeSelection)
      .on('set', this.dreambox.setPowerMode.bind(this.dreambox));

    this.dreambox.setMQTTPowerHandler((power) => {
      tvService.updateCharacteristic(this.platform.Characteristic.Active, power);
    });

    this.dreambox.setMQTTChannelHandler((channel) => {
      tvService.updateCharacteristic(this.platform.Characteristic.ActiveIdentifier, channel);
    });
    return tvService;
  }

  //Prepare speaker service
  prepereTvSpeakerService() {
    this.platform.log.debug('Device: %s, prepereTvSpeakerService', this.dreambox.hostname);
    const tvSpeakerService = this.tvAccessory.addService(this.platform.Service.TelevisionSpeaker);
    tvSpeakerService
      .setCharacteristic(this.platform.Characteristic.Active, this.platform.Characteristic.Active.ACTIVE)
      .setCharacteristic(this.platform.Characteristic.VolumeControlType, this.platform.Characteristic.VolumeControlType.ABSOLUTE);
    tvSpeakerService.getCharacteristic(this.platform.Characteristic.VolumeSelector)
      .on('set', this.volumeSelectorPress.bind(this));
    tvSpeakerService.getCharacteristic(this.platform.Characteristic.Volume)
      .on('get', this.dreambox.getVolume.bind(this.dreambox))
      .on('set', this.dreambox.setVolume.bind(this.dreambox));
    tvSpeakerService.getCharacteristic(this.platform.Characteristic.Mute)
      .on('get', this.dreambox.getMute.bind(this.dreambox))
      .on('set', this.dreambox.setMute.bind(this.dreambox));
  }

  prepareTvInputServices() {
    return new Promise((resolve, reject) => {
      this.platform.log.debug('Device: %s, prepareTvInputServices', this.dreambox.hostname);
      this.dreambox.getAllChannels()
        .then(channels => {
          let channel = 0;
          channels.forEach(ch => {
            const channelName = String(channel + 1).padStart(2, '0') + '. ' + ch.name;
            const channelReference = ch.reference;
            if (channel < 97) { // Max 97 channels can be used
              this.createInputSource(channelReference, channelName, channel);
              channel++;
            }
          });
          resolve(channel);
        })
        .catch(err => reject(err));
    });
  }

  createInputSource(reference, name, number, sourceType = this.platform.Characteristic.InputSourceType.HDMI, deviceType = this.platform.Characteristic.InputDeviceType.TV) {
    this.platform.log.debug('Device: %s, createInputSource :- %s', this.dreambox.hostname, name);
    const input = this.tvAccessory.addService(this.platform.Service.InputSource, reference, name);
    input
      .setCharacteristic(this.platform.Characteristic.Identifier, number)
      .setCharacteristic(this.platform.Characteristic.ConfiguredName, name)
      .setCharacteristic(this.platform.Characteristic.IsConfigured, this.platform.Characteristic.IsConfigured.CONFIGURED)
      .setCharacteristic(this.platform.Characteristic.InputSourceType, sourceType)
      .setCharacteristic(this.platform.Characteristic.InputDeviceType, deviceType)
      .setCharacteristic(this.platform.Characteristic.CurrentVisibilityState, this.platform.Characteristic.CurrentVisibilityState.SHOWN);
    input
      .getCharacteristic(this.platform.Characteristic.ConfiguredName)
      .on('set', (name, callback) => {
        this.platform.log.debug('Device: %s, saved new channel successfull, name: %s, reference: %s', this.dreambox.hostname, name, reference);
        callback();
      });
    this.tvService.addLinkedService(input);
  }

  volumeSelectorPress(remoteKey, callback) {
    const commands = new Map([
      [this.platform.Characteristic.VolumeSelector.INCREMENT, 'up'],
      [this.platform.Characteristic.VolumeSelector.DECREMENT, 'down'],
    ]);
    const command = commands.get(remoteKey) || '';
    this.dreambox.volumeSelectorPress(remoteKey, command, callback);
  }

  remoteKeyPress(remoteKey, callback) {
    const commands = new Map([
      [this.platform.Characteristic.RemoteKey.REWIND, 168],
      [this.platform.Characteristic.RemoteKey.FAST_FORWARD, 159],
      [this.platform.Characteristic.RemoteKey.NEXT_TRACK, 407],
      [this.platform.Characteristic.RemoteKey.PREVIOUS_TRACK, 412],
      [this.platform.Characteristic.RemoteKey.ARROW_UP, 103],
      [this.platform.Characteristic.RemoteKey.ARROW_DOWN, 108],
      [this.platform.Characteristic.RemoteKey.ARROW_LEFT, 105],
      [this.platform.Characteristic.RemoteKey.ARROW_RIGHT, 106],
      [this.platform.Characteristic.RemoteKey.SELECT, 352],
      [this.platform.Characteristic.RemoteKey.BACK, 174],
      [this.platform.Characteristic.RemoteKey.EXIT, 174],
      [this.platform.Characteristic.RemoteKey.PLAY_PAUSE, 139],
      [this.platform.Characteristic.RemoteKey.INFORMATION, 358],
    ]);
    const command = commands.get(remoteKey) || 0;
    this.dreambox.remoteKeyPress(remoteKey, command, callback);
  }
}