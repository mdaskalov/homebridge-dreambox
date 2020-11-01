const fetch = require('node-fetch');
const xml2js = require('xml2js');
const url = require('url');

class Dreambox {
  constructor(platform, device) {
    this.platform = platform;
    this.log = platform.log;

    this.powerState = false;
    this.muteState = false;
    this.volumeState = 0;
    this.channel = 0;
    this.channels = [];

    this.uuid = platform.deviceUUID(device);
    this.name = device['name'];
    this.hostname = device['hostname'];
    this.port = device['port'];
    this.username = device['username'];
    this.password = device['password'];
    this.bouquet = device['bouquet'] || 'Favourites (TV)';

    this.getDeviceInfo();

    // Setup MQTT subscriptions
    var topic = device['mqttTopic'];
    if (platform.mqttClient && topic) {
      platform.mqttClient.mqttSubscribe(topic + '/state/power', (topic, message) => {
        let msg = JSON.parse(message);
        this.powerState = (msg.power === 'True');
        this.log.debug('Device: %s, MQTT Power: %s', this.hostname, this.getPowerStateString());
      });
      platform.mqttClient.mqttSubscribe(topic + '/state/channel', (topic, message) => {
        let msg = JSON.parse(message);
        this.channels.find((channel, index) => {
          if (channel.name === msg.name) {
            this.channel = index;
            this.log.debug('Device: %s, MQTT Channel: %s :- %s (%s)', this.hostname, this.channel, channel.name, channel.reference);
            return true;
          }
        });
      });
    }

  }

  getMuteString() {
    return this.muteState ? 'ON' : 'OFF';
  }

  getPowerStateString() {
    return this.powerState ? 'ON' : 'STANDBY';
  }

  callEnigmaWebAPI(path, query, options = {}) {
    return new Promise((resolve, reject) => {
      const endpoint = url.format({
        protocol: 'http',
        hostname: this.hostname,
        port: this.port,
        pathname: '/web/' + path,
        query: query
      });

      if (this.username && this.password) {
        let auth = Buffer.from(encodeURIComponent(this.username) + ':' + encodeURIComponent(this.password));
        var headers = {
          'Authorization': 'Basic ' + auth.toString('base64')
        };
        options.headers = headers;
      }

      fetch(endpoint, options)
        .then(res => res.text())
        .then(body => xml2js.parseStringPromise(body, {
          trim: true,
          explicitArray: false
        }))
        .then(res => resolve(res))
        .catch(err => {
          this.log.error('Device: %s, API Call: %s, Error: ', this.hostname, endpoint, err.message);
          reject(err);
        });
    });
  }

  getAllChannels() {
    return new Promise((resolve, reject) => {
      this.callEnigmaWebAPI('getallservices')
        .then(res => {
          if (res && res.e2servicelistrecursive && res.e2servicelistrecursive.e2bouquet) {
            let bouquet = res.e2servicelistrecursive.e2bouquet;
            if (Array.isArray(bouquet)) {
              bouquet = bouquet.find(b => b.e2servicename === this.bouquet);
            }
            if (bouquet) {
              bouquet.e2servicelist.e2service.forEach(service => {
                const channelReference = service.e2servicereference;
                if (!channelReference.startsWith('1:64:')) { // Skip markers
                  this.channels.push({
                    name: service.e2servicename,
                    reference: channelReference
                  });
                }
              });
              this.log.info('Device: %s, configured %d channel(s)', this.hostname, this.channels.length);
              resolve(this.channels);
            }
          }
        })
        .catch(reject);
    });
  }

  getDeviceInfo() {
    this.log.debug('Device: %s, getDeviceInfo', this.hostname);
    this.callEnigmaWebAPI('about')
      .then(res => {
        if (res && res.e2abouts && res.e2abouts.e2about) {
          // Device Info
          this.manufacturer = 'Dream Multimedia';
          this.modelName = res.e2abouts.e2about.e2model;
          this.serialNumber = res.e2abouts.e2about.e2lanmac;
          this.firmwareRevision = res.e2abouts.e2about.e2enigmaversion;
        }
      })
      .catch(err => this.log(err));
  }

  getPowerState(callback) {
    this.callEnigmaWebAPI('powerstate')
      .then(res => {
        if (res && res.e2powerstate && res.e2powerstate.e2instandby) {
          this.powerState = res.e2powerstate.e2instandby === 'false';
          this.log.debug('Device: %s, getPower: %s', this.hostname, this.getPowerStateString());
          callback(null, this.powerState);
        }
      })
      .catch(err => callback(err));
  }

  setPowerState(state, callback) {
    this.powerState = state;
    this.log.debug('Device: %s, setPower: %s', this.hostname, this.getPowerStateString());
    this.callEnigmaWebAPI('powerstate', {
        newstate: (state ? '4' : '5')
      })
      .then(() => callback(null, state))
      .catch(err => callback(err));
  }

  getMute(callback) {
    this.log.debug('Device: %s, getMute: %s', this.hostname, this.getMuteString());
    callback(null, this.muteState);
  }

  setMute(state, callback) {
    this.muteState = state;
    this.log.debug('Device: %s, setMute: %s', this.hostname, this.getMuteString());
    callback(null, this.muteState);
  }

  getVolume(callback) {
    this.log.debug('Device: %s, getVolume: %s', this.hostname, this.volumeState);
    callback(null, this.volumeState);
  }

  setVolume(volume, callback) {
    this.volumeState = volume;
    this.log.debug('Device: %s, setVolume: %s', this.hostname, this.volumeState);
    callback(null, this.volumeState);
  }

  getChannel(callback) {
    if (this.powerState) {
      this.callEnigmaWebAPI('getcurrent')
        .then(res => {
          if (res && res.e2currentserviceinformation && res.e2currentserviceinformation.e2service) {
            const reference = res.e2currentserviceinformation.e2service.e2servicereference;
            this.channels.find((channel, index) => {
              if (channel.reference === reference) {
                this.log.debug('Device: %s, getChannel: %s :- %s (%s)', this.hostname, index, channel.name, channel.reference);
                this.channel = index;
                return true;
              }
            });
          }
          callback(null, this.channel);
        })
        .catch(err => {
          this.log(err);
          callback(err);
        });
    } else
      callback(null, this.channel);
  }

  setChannelByRef(ref) {
    return this.callEnigmaWebAPI('zap', {
      sRef: ref
    });
  }

  setChannel(channel, callback) {
    this.channel = channel;
    this.log.debug('Device: %s, setChannel: %s', this.hostname, channel);
    this.setChannelByRef(this.channels[this.channel].reference)
      .then(() => callback(null, channel))
      .catch(err => callback(err));
  }

  setPowerMode(state, callback) {
    this.powerState = state;
    this.log.debug('Device: %s, setPowerMode: %s', this.hostname, this.getPowerStateString());
    callback(null, state);
  }

  volumeSelectorPress(remoteKey, command, callback) {
    this.log.debug('Device: %s, volumeSelectorPress: %s, command: %s', this.dreambox.hostname, remoteKey, command);
    this.dreambox.callEnigmaWebAPI('vol', {
        set: command
      })
      .then(() => callback(null, remoteKey))
      .catch(err => callback(err));
  }

  remoteKeyPress(remoteKey, command, callback) {
    this.log.debug('Device: %s, remoteKeyPress: %s, command: %s', this.dreambox.hostname, remoteKey, command);
    this.dreambox.callEnigmaWebAPI('remotecontrol', {
        command: command
      })
      .then(() => callback(null, remoteKey))
      .catch(err => callback(err));
  }

}

module.exports = Dreambox;