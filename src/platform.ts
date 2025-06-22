import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { DreamboxDevice, DreamboxAccessory } from './dreambox-accessory';
import { DreamboxDeviceChannel, ChannelAccessory } from './channel-accessory';
import { Dreambox } from './dreambox';
import { MQTTClient } from './mqtt-client';

export class DreamboxPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service;
  public readonly Characteristic: typeof Characteristic;
  public readonly accessories: Map<string, PlatformAccessory> = new Map();
  public readonly mqttClient?: MQTTClient;

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.Service = api.hap.Service;
    this.Characteristic = api.hap.Characteristic;
    if (this.config.mqtt) {
      this.mqttClient = new MQTTClient(this.log, this.config);
    }

    this.log.debug('Finished initializing %s platform...', this.config.name || 'Dreambox');

    this.api.on('didFinishLaunching', async () => {
      await this.setupDevices();
    });

    this.api.on('shutdown', () => {
      this.mqttClient?.shutdown();
    });

  }

  configureAccessory(accessory: PlatformAccessory) {
    this.log.debug('Loading accessory from cache:', accessory.displayName);
    this.accessories.set(accessory.UUID, accessory);
  }

  dreamboxUUID(dreambox: Dreambox): string {
    return this.api.hap.uuid.generate(dreambox.hostname + dreambox.bouquet);
  }

  channelUUID(channel: DreamboxDeviceChannel): string {
    return this.api.hap.uuid.generate(channel.name + channel.ref);
  }

  setupDeviceChannels(device: DreamboxDevice, dreambox: Dreambox) {
    const configuredUUIDs: string[] = [];
    if (Array.isArray(device.channels)) {
      for (const channel of device.channels) {
        if ((<DreamboxDeviceChannel>channel).name && (<DreamboxDeviceChannel>channel).ref) {
          const uuid = this.channelUUID(channel);
          const existingAccessory = this.accessories.get(uuid);
          this.log.info('%s channel accessory: %s (%s)',
            existingAccessory ? 'Restoring' : 'Adding',
            channel.name, channel.ref,
          );
          if (existingAccessory) {
            existingAccessory.context.ref = channel.ref;
            new ChannelAccessory(this, existingAccessory, dreambox);
          } else {
            const accessory = new this.api.platformAccessory(channel.name, uuid);
            accessory.context.ref = channel.ref;
            new ChannelAccessory(this, accessory, dreambox);
            this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
          }
          configuredUUIDs.push(uuid);
        } else {
          this.log.error('Ignored channel: %s', channel);
        }
      }
    }
    for (const [uuid, accessory] of this.accessories) {
      if (!configuredUUIDs.includes(uuid)) {
        this.log.info('Removing channel accessory: %s (%s)', accessory.displayName, accessory.context.ref);
        this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      }
    }
  }

  async setupDevices() {
    if (Array.isArray(this.config.devices)) {
      for (const device of this.config.devices) {
        if ((<DreamboxDevice>device).name && (<DreamboxDevice>device).hostname) {
          try {
            const dreambox = new Dreambox(this, device);
            await dreambox.readDeviceInfo();
            await dreambox.readChannels();
            const uuid = this.dreamboxUUID(dreambox);
            const accessory = new this.api.platformAccessory(dreambox.name, uuid);
            accessory.context.dreambox = dreambox;
            new DreamboxAccessory(this, accessory, dreambox);
            this.log.info('Adding dreambox accessory: %s (host: %s, bouquet: %s) with %d channel(s)',
              dreambox.name, dreambox.hostname, dreambox.bouquet, dreambox.channels.length,
            );
            this.api.publishExternalAccessories(PLUGIN_NAME, [accessory]);
            this.setupDeviceChannels(device, dreambox);
          } catch (err) {
            this.log.error('Failed configuring device:', err);
          }
        }
      }
    }
  }

}