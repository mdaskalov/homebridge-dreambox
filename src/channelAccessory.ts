import type { PlatformAccessory, Service } from 'homebridge';
import { LogLevel } from 'homebridge';
import type { DreamboxPlatform } from './platform';
import type { Dreambox } from './dreambox';
import { safeChannelName } from './dreambox';

export class ChannelAccessory {
  protected service: Service;
  private name: string;
  private ref: string;

  private static buttonResetTimeout = 500;

  constructor(
    protected readonly platform: DreamboxPlatform,
    protected readonly accessory: PlatformAccessory,
    private readonly dreambox: Dreambox,
  ) {
    this.name = safeChannelName(accessory.displayName);
    this.ref = accessory.context.ref;

    this.service = accessory.getService(platform.Service.Switch) || accessory.addService(platform.Service.Switch);
    this.service.setCharacteristic(platform.Characteristic.Name, this.name);

    this.service
      .getCharacteristic(platform.Characteristic.On)
      .onGet(() => false)
      .onSet(async (value) => {
        this.dreambox.log(LogLevel.DEBUG, 'ChannelAccessory: setChannel: %s (%s)', this.name, this.ref);
        this.service.getCharacteristic(this.platform.Characteristic.On).updateValue(value);
        try {
          await this.dreambox.setChannelByRef(this.ref);
        } catch (err) {
          this.dreambox.logError('ChannelAccessory: setChannel', err);
          throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
        }
        setTimeout(() => {
          this.service.getCharacteristic(this.platform.Characteristic.On).updateValue(false);
        }, ChannelAccessory.buttonResetTimeout);
      });
  }
}
