import { PlatformAccessory, Service, CharacteristicValue, LogLevel } from 'homebridge';
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

    this.dreambox.deviceInfoHandler = deviceInfo => {
      this.tvAccessory
        .getService(this.platform.Service.AccessoryInformation)!
        .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Dream Multimedia')
        .setCharacteristic(this.platform.Characteristic.Model, deviceInfo.modelName)
        .setCharacteristic(this.platform.Characteristic.SerialNumber, deviceInfo.serialNumber)
        .setCharacteristic(this.platform.Characteristic.FirmwareRevision, deviceInfo.firmwareRevision);
    };

    this.dreambox.deviceChannelsHandler = channels => {
      let channelCount = 0;
      channels.forEach(ch => {
        const channelName = String(channelCount + 1).padStart(2, '0') + '. ' + ch.name;
        const channelReference = ch.reference;
        if (channelCount < 97) { // Max 97 channels can be used
          this.createInputSource(channelReference, channelName, channelCount);
          channelCount++;
        }
      });
      this.dreambox.log(LogLevel.DEBUG, 'prepared %s channel(s).', channelCount);
    };

    this.dreambox.deviceStateHandler = state => {
      this.tvService.getCharacteristic(this.platform.Characteristic.Active).updateValue(state.power);
      this.tvService.getCharacteristic(this.platform.Characteristic.ActiveIdentifier).updateValue(state.channel);
    };

    this.prepareServices();
  }

  async prepareServices() {
    this.prepareTvService();
    this.prepereTvSpeakerService();
    await this.prepareTvInputServices();
    await this.dreambox.getDeviceInfo();
    this.dreambox.log(LogLevel.DEBUG, 'publishExternalAccessories: %s', this.dreambox.name);
    this.platform.api.publishExternalAccessories(PLUGIN_NAME, [this.tvAccessory]);
  }

  prepareTvService() {
    this.dreambox.log(LogLevel.DEBUG, 'prepareTvService');
    this.tvService.setCharacteristic(this.platform.Characteristic.ConfiguredName, this.dreambox.name);
    this.tvService.setCharacteristic(this.platform.Characteristic.SleepDiscoveryMode, this.platform.Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE);
    this.tvService.getCharacteristic(this.platform.Characteristic.Active)
      .onGet(this.getPowerState.bind(this))
      .onSet(this.setPowerState.bind(this));
    this.tvService.getCharacteristic(this.platform.Characteristic.ActiveIdentifier)
      .onGet(this.getChannel.bind(this))
      .onSet(this.setChannel.bind(this));
    this.tvService.getCharacteristic(this.platform.Characteristic.RemoteKey)
      .onSet(this.remoteKeyPress.bind(this));
    this.tvService.getCharacteristic(this.platform.Characteristic.PowerModeSelection)
      .onSet(value => this.dreambox.state.power = value as boolean);
  }

  prepereTvSpeakerService() {
    this.dreambox.log(LogLevel.DEBUG, 'prepereTvSpeakerService');
    const tvSpeakerService = this.tvAccessory.addService(this.platform.Service.TelevisionSpeaker);
    tvSpeakerService
      .setCharacteristic(this.platform.Characteristic.Active, this.platform.Characteristic.Active.ACTIVE)
      .setCharacteristic(this.platform.Characteristic.VolumeControlType, this.platform.Characteristic.VolumeControlType.ABSOLUTE);
    tvSpeakerService.getCharacteristic(this.platform.Characteristic.VolumeSelector)
      .onSet(this.volumeSelectorPress.bind(this));
    tvSpeakerService.getCharacteristic(this.platform.Characteristic.Volume)
      .onGet(() => this.dreambox.state.volume)
      .onSet(value => this.dreambox.state.volume = value as number);
    tvSpeakerService.getCharacteristic(this.platform.Characteristic.Mute)
      .onGet(() => this.dreambox.state.mute)
      .onSet(value => this.dreambox.state.mute = value as boolean);
  }

  async prepareTvInputServices() {
    this.dreambox.log(LogLevel.DEBUG, 'prepareTvInputServices');
    try {
      await this.dreambox.getAllChannels();
    } catch (err) {
      this.dreambox.logError('prepareTvInputServices', err);
      throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    }
  }

  createInputSource(reference: string, name: string, number: number, sourceType = this.platform.Characteristic.InputSourceType.HDMI, deviceType = this.platform.Characteristic.InputDeviceType.TV) {
    this.dreambox.log(LogLevel.DEBUG, 'createInputSource :- %s', name);
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
        this.dreambox.log(LogLevel.DEBUG, 'saved new channel successfull, name: %s, reference: %s', name, reference);
      });
    this.tvService.addLinkedService(input);
  }

  async getPowerState() {
    try {
      return await this.dreambox.getPowerState();
    } catch (err) {
      this.dreambox.logError('getPowerState', err);
      throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    }
  }

  async setPowerState(value: CharacteristicValue) {
    try {
      await this.dreambox.setPowerState(value as boolean);
    } catch (err) {
      this.dreambox.logError('setPowerState', err);
      throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    }
  }

  async getChannel() {
    try {
      return await this.dreambox.getChannel();
    } catch (err) {
      this.dreambox.logError('getChannel', err);
      throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    }
  }

  async setChannel(value: CharacteristicValue) {
    try {
      await this.dreambox.setChannel(value as number);
    } catch (err) {
      this.dreambox.logError('setChannel', err);
      throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    }
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
    try {
      await this.dreambox.remoteKeyPress(command);
    } catch (err) {
      this.dreambox.logError('remoteKeyPress', err);
      throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    }
  }

  async volumeSelectorPress(volumeSelector: CharacteristicValue) {
    const commands = new Map([
      [this.platform.Characteristic.VolumeSelector.INCREMENT, 'up'],
      [this.platform.Characteristic.VolumeSelector.DECREMENT, 'down'],
    ]);
    const command = commands.get(volumeSelector as number) || '';
    try {
      await this.dreambox.volumeSelectorPress(command);
    } catch (err) {
      this.dreambox.logError('volumeSelectorPress', err);
      throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    }
  }

}