import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { DreamboxAccessory } from './dreambox-accessory';
import { ChannelAccessory } from './channel-accessory';
import { Dreambox } from './dreambox';
import { MQTTClient } from './mqtt-client';

export class DreamboxPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;
  public mqttClient?: MQTTClient;
  public readonly accessories: PlatformAccessory[] = [];

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.api.on('didFinishLaunching', () => {
      if (this.config.mqtt) {
        this.mqttClient = new MQTTClient(this.log, this.config);
      }
      this.setupDevices();
      this.cleanupCache();
      this.log.debug('Finished initialization');
    });
  }

  configureAccessory(accessory: PlatformAccessory) {
    this.accessories.push(accessory);
  }

  channelUUID(channel): string {
    return this.api.hap.uuid.generate(channel.name + channel.ref);
  }

  setupDevices() {
    if (Array.isArray(this.config.devices)) {
      this.config.devices.forEach(device => {
        const dreambox = new Dreambox(this, device);
        new DreamboxAccessory(this, dreambox);
        if (Array.isArray(device.channels)) {
          device.channels.forEach(channel => {
            const uuid = this.channelUUID(channel);
            const existingChannel = this.accessories.find(a => a.UUID === uuid);
            if (existingChannel) {
              this.log.info('Restoring existing channel accessory from cache: %s', channel.name);
              existingChannel.context.channel = channel;
              this.api.updatePlatformAccessories([existingChannel]);
              new ChannelAccessory(this, existingChannel, dreambox);
            } else {
              this.log.info('Adding new channel accessory: %s', channel.name);
              const accessory = new this.api.platformAccessory(channel.name, uuid);
              accessory.context.channel = channel;
              new ChannelAccessory(this, accessory, dreambox);
              this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
            }
          });
        }
      });
    }
  }

  uuidUsed(uuid: string): boolean {
    let used = false;
    if (Array.isArray(this.config.devices)) {
      this.config.devices.forEach(device => {
        if (Array.isArray(device.channels)) {
          device.channels.forEach(channel => {
            if (this.channelUUID(channel) === uuid) {
              used = true;
            }
          });
        }
      });
    }
    return used;
  }

  cleanupCache() {
    if (Array.isArray(this.accessories)) {
      this.log.debug('CleanupCache...');
      this.accessories.forEach(accessory => {
        this.log.debug('Accessory UUID:', accessory.UUID, 'Name:', accessory.displayName);
        if (!this.uuidUsed(accessory.UUID)) {
          this.log.info('Removing unused accessory from cache: %s', accessory.displayName);
          this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
        }
      });
    }
  }

}