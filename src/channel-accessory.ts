import { LogLevel, PlatformAccessory, Service } from 'homebridge';
import { DreamboxPlatform } from './platform';
import { Dreambox } from './dreambox';

export class ChannelAccessory {
  protected service: Service;
  private name: string;
  private reference: string;

  constructor(protected readonly platform: DreamboxPlatform, protected readonly accessory: PlatformAccessory, private readonly dreambox: Dreambox) {
    this.name = accessory.context.channel.name;
    this.reference = accessory.context.channel.ref;

    this.service = accessory.getService(platform.Service.Switch) || accessory.addService(platform.Service.Switch);
    this.service.setCharacteristic(platform.Characteristic.Name, accessory.context.channel.name);

    this.service.getCharacteristic(platform.Characteristic.On)
      .onGet(() => 0)
      .onSet(async value => {
        this.dreambox.log(LogLevel.DEBUG, 'ChannelAccessory: setChannel: %s (%s)', this.name, this.reference);
        this.service.getCharacteristic(this.platform.Characteristic.On).updateValue(value);
        try {
          await this.dreambox.setChannelByRef(this.reference);
        } catch (err) {
          this.dreambox.log(LogLevel.ERROR, 'ChannelAccessory: setChannel failed: %s', err.message);
          throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
        }
        setTimeout(() => {
          this.service.getCharacteristic(this.platform.Characteristic.On).updateValue(0);
        }, 500);
      });
  }

}