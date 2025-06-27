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
      .onGet(this.getPower.bind(this))
      .onSet(this.setPower.bind(this));
    this.service.getCharacteristic(this.platform.Characteristic.ActiveIdentifier)
      .onGet(this.getChannel.bind(this))
      .onSet(this.setChannel.bind(this));
    this.service.getCharacteristic(this.platform.Characteristic.RemoteKey)
      .onSet(this.remoteKeyPress.bind(this));
    this.service.getCharacteristic(this.platform.Characteristic.PowerModeSelection)
      .onSet(this.setPowerModeSelection.bind(this));
  }

  configureSpeakerService() {
    this.dreambox.log(LogLevel.DEBUG, 'configureSpeakerService');
    const speakerService = this.accessory.addService(this.platform.Service.TelevisionSpeaker);
    speakerService
      .setCharacteristic(this.platform.Characteristic.Active, this.platform.Characteristic.Active.ACTIVE)
      .setCharacteristic(this.platform.Characteristic.VolumeControlType, this.platform.Characteristic.VolumeControlType.ABSOLUTE);
    speakerService.getCharacteristic(this.platform.Characteristic.VolumeSelector)
      .onSet(this.setVolumeSelector.bind(this));
    speakerService.getCharacteristic(this.platform.Characteristic.Volume)
      .onGet(this.getVolume.bind(this))
      .onSet(this.setVolume.bind(this));
    speakerService.getCharacteristic(this.platform.Characteristic.Mute)
      .onGet(this.getMute.bind(this))
      .onSet(this.setMute.bind(this));
  }

  configureInputServices() {
    this.dreambox.log(LogLevel.DEBUG, 'configureInputServices');
    let channelCount = 0;
    for (const ch of this.dreambox.channels) {
      if (channelCount > 50) { // Max 50 channels can be used
        break;
      }
      this.createInputSource(ch.ref, ch.name, channelCount);
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
      .setCharacteristic(this.platform.Characteristic.InputSourceType, this.platform.Characteristic.InputSourceType.OTHER)
      .setCharacteristic(this.platform.Characteristic.InputDeviceType, this.platform.Characteristic.InputDeviceType.TV)
      .setCharacteristic(this.platform.Characteristic.CurrentVisibilityState, this.platform.Characteristic.CurrentVisibilityState.SHOWN);
    input
      .getCharacteristic(this.platform.Characteristic.ConfiguredName)
      .onSet(this.setConfiguredName.bind(this));
    this.service.addLinkedService(input);
  }

  async getPower(): Promise<CharacteristicValue> {
    await this.dreambox.updatePowerState();
    this.dreambox.log(LogLevel.DEBUG, 'getPower:', this.dreambox.state.power);
    return this.dreambox.state.power;
  }

  async setPower(value: CharacteristicValue) {
    await this.dreambox.updatePowerState(value as boolean ? '4' : '5');
    this.dreambox.log(LogLevel.DEBUG, 'setPower:', this.dreambox.state.power);
  }

  async getChannel(): Promise<CharacteristicValue> {
    await this.dreambox.updateChannelState();
    this.dreambox.log(LogLevel.DEBUG, 'getChannel:', this.dreambox.state.channel);
    return this.dreambox.state.channel;
  }

  async setChannel(value: CharacteristicValue) {
    const index = value as number;
    if (index > 0 && index < this.dreambox.channels.length) {
      const channelRef = this.dreambox.channels[index].ref;
      await this.dreambox.setChannelByRef(channelRef);
    }
    this.dreambox.log(LogLevel.DEBUG, 'setChannel:', this.dreambox.state.channel);
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
    this.dreambox.log(LogLevel.DEBUG, 'remoteKeyPress:', command);
  }

  async setPowerModeSelection(selection: CharacteristicValue) {
    await this.dreambox.remoteKeyPress(139); // show menu
    this.dreambox.log(LogLevel.DEBUG, 'setPowerModeSelection: %s',
      selection === this.platform.Characteristic.PowerModeSelection.SHOW ? 'SHOW' : 'HIDE');
  }

  async setVolumeSelector(volumeSelector: CharacteristicValue) {
    const commands = new Map([
      [this.platform.Characteristic.VolumeSelector.INCREMENT, 'up'],
      [this.platform.Characteristic.VolumeSelector.DECREMENT, 'down'],
    ]);
    const command = commands.get(volumeSelector as number);
    this.dreambox.updateVolumeState(command);
    this.dreambox.log(LogLevel.DEBUG, 'setVolumeSelector %s: %s', command, this.dreambox.state.volume);
  }

  async getVolume(): Promise<CharacteristicValue> {
    await this.dreambox.updateVolumeState();
    this.dreambox.log(LogLevel.DEBUG, 'getVolume:', this.dreambox.state.volume);
    return this.dreambox.state.volume;
  }

  async setVolume(value: CharacteristicValue) {
    this.dreambox.updateVolumeState(`set${value as number}`);
    this.dreambox.log(LogLevel.DEBUG, 'setVolume:', this.dreambox.state.volume);
  }

  async getMute(): Promise<CharacteristicValue> {
    await this.dreambox.updateVolumeState();
    this.dreambox.log(LogLevel.DEBUG, 'getMute:', this.dreambox.state.mute);
    return this.dreambox.state.mute;
  }

  async setMute(value: CharacteristicValue) {
    if (value !== this.dreambox.state.mute) {
      this.dreambox.updateVolumeState('mute');
    }
    this.dreambox.log(LogLevel.DEBUG, 'setMute:', this.dreambox.state.mute);
  }

  async setConfiguredName(name: CharacteristicValue) {
    this.dreambox.log(LogLevel.DEBUG, 'channel renamed to %s', name);
  }

}