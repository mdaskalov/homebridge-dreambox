class ChannelAccessory {
  
  constructor(platform, accessory) {
    this.state = 0;
    this.log = platform.log;
    this.service = accessory.getService(platform.Service.Switch) || accessory.addService(platform.Service.Switch);
    this.service.setCharacteristic(platform.Characteristic.Name, accessory.context.channel.name);

    this.service.getCharacteristic(platform.Characteristic.On)
      .on('get', this.getState.bind(this))
      .on('set', this.setState.bind(this));
  }

  setState(value, callback) {
    this.state = value;
    this.log.debug('SetState',value);
    callback(null);
  }

  getState(callback) {
    this.log.debug('GetState',this.state);
    callback(null, this.state);
  }
}

module.exports = ChannelAccessory;