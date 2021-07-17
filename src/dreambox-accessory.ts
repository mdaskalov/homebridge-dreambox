import { PlatformAccessory, Service, CharacteristicValue } from 'homebridge';
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

    this.tvService = this.tvAccessory.addService(this.platform.Service.Television);
    this.prepareServices();
  }

  async prepareServices() {
    this.prepareTvService();
    this.prepereTvSpeakerService();
    const channels = await this.prepareTvInputServices();
    this.platform.log.debug('Device: %s, prepared %s channels.', this.dreambox.hostname, channels);
    const deviceInfo = await this.dreambox.getDeviceInfo();
    this.tvAccessory
      .getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Dream Multimedia')
      .setCharacteristic(this.platform.Characteristic.Model, deviceInfo.modelName)
      .setCharacteristic(this.platform.Characteristic.SerialNumber, deviceInfo.serialNumber)
      .setCharacteristic(this.platform.Characteristic.FirmwareRevision, deviceInfo.firmwareRevision);
    this.platform.log.debug('Device: %s, publishExternalAccessories: %s', this.dreambox.hostname, this.dreambox.name);
    this.platform.api.publishExternalAccessories(PLUGIN_NAME, [this.tvAccessory]);
  }

  prepareTvService() {
    this.platform.log.debug('Device: %s, prepareTvService', this.dreambox.hostname);

    this.tvService.setCharacteristic(this.platform.Characteristic.ConfiguredName, this.dreambox.name);
    this.tvService.setCharacteristic(this.platform.Characteristic.SleepDiscoveryMode, this.platform.Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE);

    this.tvService.getCharacteristic(this.platform.Characteristic.Active)
      .onGet(async () => await this.dreambox.getPowerState())
      .onSet(async value => await this.dreambox.setPowerState(value as boolean));

    this.tvService.getCharacteristic(this.platform.Characteristic.ActiveIdentifier)
      .onGet(async () => await this.dreambox.getChannel())
      .onSet(async value => await this.dreambox.setChannel(value as number));

    this.tvService.getCharacteristic(this.platform.Characteristic.RemoteKey)
      .onSet(this.remoteKeyPress.bind(this));

    this.tvService.getCharacteristic(this.platform.Characteristic.PowerModeSelection)
      .onSet(value => this.dreambox.powerState = value as boolean);

    this.dreambox.mqttPowerHandler = power => {
      this.tvService.getCharacteristic(this.platform.Characteristic.Active).updateValue(power);
    };

    this.dreambox.mqttChannelHandler = channel => {
      this.tvService.getCharacteristic(this.platform.Characteristic.ActiveIdentifier).updateValue(channel);
    };
  }

  prepereTvSpeakerService() {
    this.platform.log.debug('Device: %s, prepereTvSpeakerService', this.dreambox.hostname);
    const tvSpeakerService = this.tvAccessory.addService(this.platform.Service.TelevisionSpeaker);
    tvSpeakerService
      .setCharacteristic(this.platform.Characteristic.Active, this.platform.Characteristic.Active.ACTIVE)
      .setCharacteristic(this.platform.Characteristic.VolumeControlType, this.platform.Characteristic.VolumeControlType.ABSOLUTE);
    tvSpeakerService.getCharacteristic(this.platform.Characteristic.VolumeSelector)
      .onSet(this.volumeSelectorPress.bind(this));
    tvSpeakerService.getCharacteristic(this.platform.Characteristic.Volume)
      .onGet(() => this.dreambox.volumeState)
      .onSet(value => this.dreambox.volumeState = value as number);
    tvSpeakerService.getCharacteristic(this.platform.Characteristic.Mute)
      .onGet(() => this.dreambox.muteState)
      .onSet(value => this.dreambox.muteState = value as boolean);
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
      .onSet(async name => {
        this.platform.log.debug('Device: %s, saved new channel successfull, name: %s, reference: %s', this.dreambox.hostname, name, reference);
      });
    this.tvService.addLinkedService(input);
  }

  async remoteKeyPress(remoteKey: CharacteristicValue) {
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
    const command = commands.get(remoteKey as number) || 0;
    await this.dreambox.remoteKeyPress(command);
  }

  async volumeSelectorPress(volumeSelector: CharacteristicValue) {
    const commands = new Map([
      [this.platform.Characteristic.VolumeSelector.INCREMENT, 'up'],
      [this.platform.Characteristic.VolumeSelector.DECREMENT, 'down'],
    ]);
    const command = commands.get(volumeSelector as number) || '';
    await this.dreambox.volumeSelectorPress(command);
  }

}