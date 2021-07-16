import { PlatformAccessory, Service } from 'homebridge';
import { DreamboxPlatform } from './platform';
import { Dreambox } from './dreambox';

export class ChannelAccessory {
  protected service: Service;
  private name: string;
  private reference: string;

  constructor(protected readonly platform: DreamboxPlatform, protected readonly accessory: PlatformAccessory, private dreambox: Dreambox) {
    this.name = accessory.context.channel.name;
    this.reference = accessory.context.channel.ref;

    this.service = accessory.getService(platform.Service.Switch) || accessory.addService(platform.Service.Switch);
    this.service.setCharacteristic(platform.Characteristic.Name, accessory.context.channel.name);

    this.service.getCharacteristic(platform.Characteristic.On)
      .on('get', this.getState.bind(this))
      .on('set', this.setState.bind(this));
  }

  setState(value, callback) {
    callback(null, 1);
    this.platform.log.debug('Set Channel:', this.name, 'Reference:', this.reference);
    this.dreambox.setChannelByRef(this.reference)
      .then(() => {
        this.service.updateCharacteristic(this.platform.Characteristic.On, 0);
      })
      .catch(err => {
        this.service.updateCharacteristic(this.platform.Characteristic.On, 0);
        this.platform.log.error(err);
      });
  }

  getState(callback) {
    callback(null, 0);
  }
}