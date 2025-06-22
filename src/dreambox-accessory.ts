import { Service, PlatformAccessory, CharacteristicValue, LogLevel } from 'homebridge';
import { DreamboxPlatform } from './platform';
import { DreamboxDeviceChannel } from './channel-accessory';
import { Dreambox } from './dreambox';

export type DreamboxDevice = {
  name: string,
  hostname: string,
  port?: number,
  username?: string,
  password?: string,
  bouquet?: string,
  channels?: Array<DreamboxDeviceChannel>,
  updateInterval?: number,
  offWhenUnreachable?: boolean,
  mqttTopic?: string
};

export class DreamboxAccessory {
  private service: Service;

  private static dreamboxRetryTimeout = 30000;

  constructor(
    protected readonly platform: DreamboxPlatform,
    protected readonly accessory: PlatformAccessory,
    protected readonly dreambox: Dreambox,
  ) {
    this.platform.log.debug('Configuring %s as external TV accessory %s', this.dreambox.hostname, this.dreambox.name);

    switch (platform.config.deviceType) {
      case 'AUDIO_RECEIVER':
        this.accessory.category = platform.api.hap.Categories.AUDIO_RECEIVER;
        break;
      case 'TELEVISION':
        this.accessory.category = platform.api.hap.Categories.TELEVISION;
        break;
      case 'TV_STREAMING_STICK':
        this.accessory.category = platform.api.hap.Categories.TV_STREAMING_STICK;
        break;
      default:
        this.accessory.category = platform.api.hap.Categories.TV_SET_TOP_BOX;
        break;
    }

    const service = this.platform.Service.Television;
    this.service = this.accessory.getService(service) || this.accessory.addService(service);

    this.dreambox.deviceStateHandler = state => {
      this.service.getCharacteristic(this.platform.Characteristic.Active).updateValue(state.power);
      this.service.getCharacteristic(this.platform.Characteristic.ActiveIdentifier).updateValue(state.channel);
    };

    this.configureAccessoryInformation();
    this.configureService();
    this.configureSpeakerService();
    this.configureInputServices();
  }

  configureAccessoryInformation() {
    this.dreambox.log(LogLevel.DEBUG, 'configureAccessoryInformation');
    this.accessory
      .getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Dream Multimedia')
      .setCharacteristic(this.platform.Characteristic.Model, this.dreambox.deviceInfo.modelName)
      .setCharacteristic(this.platform.Characteristic.SerialNumber, this.dreambox.deviceInfo.serialNumber)
      .setCharacteristic(this.platform.Characteristic.FirmwareRevision, this.dreambox.deviceInfo.firmwareRevision);
  }

  configureService() {
    this.dreambox.log(LogLevel.DEBUG, 'configureService');
    this.service.setCharacteristic(this.platform.Characteristic.ConfiguredName, this.dreambox.name);
    this.service.setCharacteristic(this.platform.Characteristic.SleepDiscoveryMode,
      this.platform.Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE);
    this.service.getCharacteristic(this.platform.Characteristic.Active)
      .onGet(this.getPowerState.bind(this))
      .onSet(this.setPowerState.bind(this));
    this.service.getCharacteristic(this.platform.Characteristic.ActiveIdentifier)
      .onGet(this.getChannel.bind(this))
      .onSet(this.setChannel.bind(this));
    this.service.getCharacteristic(this.platform.Characteristic.RemoteKey)
      .onSet(this.remoteKeyPress.bind(this));
    this.service.getCharacteristic(this.platform.Characteristic.PowerModeSelection)
      .onSet(async () => {
        await this.dreambox.remoteKeyPress(139); // show menu
      });
  }

  configureSpeakerService() {
    this.dreambox.log(LogLevel.DEBUG, 'configureSpeakerService');
    const speakerService = this.accessory.addService(this.platform.Service.TelevisionSpeaker);
    speakerService
      .setCharacteristic(this.platform.Characteristic.Active, this.platform.Characteristic.Active.ACTIVE)
      .setCharacteristic(this.platform.Characteristic.VolumeControlType, this.platform.Characteristic.VolumeControlType.ABSOLUTE);
    speakerService.getCharacteristic(this.platform.Characteristic.VolumeSelector)
      .onSet(this.volumeSelectorPress.bind(this));
    speakerService.getCharacteristic(this.platform.Characteristic.Volume)
      .onGet(() => this.dreambox.state.volume)
      .onSet(value => this.dreambox.state.volume = value as number);
    speakerService.getCharacteristic(this.platform.Characteristic.Mute)
      .onGet(() => this.dreambox.state.mute)
      .onSet(value => this.dreambox.state.mute = value as boolean);
  }

  configureInputServices() {
    this.dreambox.log(LogLevel.DEBUG, 'configureInputServices');
    let channelCount = 0;
    for (const ch of this.dreambox.channels) {
      const channelName = String(channelCount + 1).padStart(2, '0') + '. ' + ch.name;
      const channelReference = ch.ref;
      if (channelCount > 50) { // Max 50 channels can be used
        break;
      }
      this.createInputSource(channelReference, channelName, channelCount);
      channelCount++;
    }
    this.dreambox.log(LogLevel.INFO, 'configured %s channel(s).', channelCount);
  }

  createInputSource(reference: string, name: string, number: number) {
    this.dreambox.log(LogLevel.DEBUG, 'createInputSource :- %s', name);
    const input = this.accessory.addService(this.platform.Service.InputSource, reference, name);
    input
      .setCharacteristic(this.platform.Characteristic.Identifier, number)
      .setCharacteristic(this.platform.Characteristic.ConfiguredName, name)
      .setCharacteristic(this.platform.Characteristic.IsConfigured, this.platform.Characteristic.IsConfigured.CONFIGURED)
      .setCharacteristic(this.platform.Characteristic.InputSourceType, this.platform.Characteristic.InputSourceType.HDMI)
      .setCharacteristic(this.platform.Characteristic.InputDeviceType, this.platform.Characteristic.InputDeviceType.TV)
      .setCharacteristic(this.platform.Characteristic.CurrentVisibilityState, this.platform.Characteristic.CurrentVisibilityState.SHOWN);
    input
      .getCharacteristic(this.platform.Characteristic.ConfiguredName)
      .onSet(async name => {
        this.dreambox.log(LogLevel.DEBUG, 'saved new channel successfull, name: %s, reference: %s', name, reference);
      });
    this.service.addLinkedService(input);
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