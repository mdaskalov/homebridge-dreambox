class ChannelAccessory {

  constructor(platform, accessory, dreambox) {
    this.platform = platform;
    this.log = platform.log;
    this.dreambox = dreambox;
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
    this.log.debug('Set Channel:', this.name, 'Reference:', this.reference);
    this.dreambox.setChannelByRef(this.reference)
      .then(() => {
        this.service.updateCharacteristic(this.platform.Characteristic.On, 0);
      })
      .catch(err => {
        this.service.updateCharacteristic(this.platform.Characteristic.On, 0);
        this.log(err);
      });
  }

  getState(callback) {
    callback(null, 0);
  }
}

module.exports = ChannelAccessory;