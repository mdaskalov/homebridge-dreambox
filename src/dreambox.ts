import { DreamboxPlatform } from './platform';
import { parseStringPromise } from 'xml2js';
import { format } from 'url';
import fetch from 'node-fetch';
import { RequestInit } from 'node-fetch';
import { ParsedUrlQueryInput } from 'querystring';

export type DreamboxChannel = {
  name: string,
  reference: string,
}

type PowerHandlerCallback =
  (power: boolean) => void;

type ChannelHandlerCallback =
  (channel: number) => void;

export class Dreambox {
  private powerState = false;
  private muteState = false;
  private volumeState = 0;
  private channel = 0;
  private channels: Array<DreamboxChannel>;

  public name: string;
  public hostname: string;
  public uuid: string;

  private port: string;
  private username: string;
  private password: string;
  private bouquet: string;

  private mqttPowerHandler?: PowerHandlerCallback;
  private mqttChannelHandler?: ChannelHandlerCallback;

  constructor(protected readonly platform: DreamboxPlatform, protected readonly device) {
    this.powerState = false;
    this.muteState = false;
    this.volumeState = 0;
    this.channel = 0;
    this.channels = [];

    this.name = device['name'];
    this.hostname = device['hostname'];
    this.port = device['port'];
    this.username = device['username'];
    this.password = device['password'];
    this.bouquet = device['bouquet'] || 'Favourites (TV)';
    this.uuid = platform.api.hap.uuid.generate(this.hostname + ':' + this.name);

    // Setup MQTT subscriptions
    const topic = device['mqttTopic'];
    if (platform.mqttClient && topic) {
      platform.mqttClient.mqttSubscribe(topic + '/state/power', (topic, message) => {
        const msg = JSON.parse(message);
        this.powerState = (msg.power === 'True');
        this.log('MQTT Power: %s', this.getPowerStateString());
        if (this.mqttPowerHandler) {
          this.mqttPowerHandler(this.powerState);
        }
      });
      platform.mqttClient.mqttSubscribe(topic + '/state/channel', (topic, message) => {
        const msg = JSON.parse(message);
        this.channels.find((channel, index) => {
          if (channel.name === msg.name) {
            this.channel = index;
            this.log('MQTT Channel: %s :- %s (%s)', this.channel, channel.name, channel.reference);
            if (this.mqttChannelHandler) {
              this.mqttChannelHandler(this.channel);
            }
            return true;
          }
        });
      });
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  log(message: string, ...parameters: any[]) {
    this.platform.log.debug('Device: %s, ' + message,
      this.hostname,
      ...parameters,
    );
  }

  setMQTTPowerHandler(handler) {
    this.mqttPowerHandler = handler;
  }

  setMQTTChannelHandler(handler) {
    this.mqttChannelHandler = handler;
  }

  getMuteString(): string {
    return this.muteState ? 'ON' : 'OFF';
  }

  getPowerStateString(): string {
    return this.powerState ? 'ON' : 'STANDBY';
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  callEnigmaWebAPI(path: string, query: string | ParsedUrlQueryInput | null | undefined = null, options: RequestInit = {}): Promise<any> {
    return new Promise((resolve, reject) => {
      const endpoint = format({
        protocol: 'http',
        hostname: this.hostname,
        port: this.port,
        pathname: '/web/' + path,
        query: query,
      });

      if (this.username && this.password) {
        const auth = Buffer.from(encodeURIComponent(this.username) + ':' + encodeURIComponent(this.password));
        const headers = {
          'Authorization': 'Basic ' + auth.toString('base64'),
        };
        options.headers = headers;
      }

      fetch(endpoint, options)
        .then(res => res.text())
        .then(body => parseStringPromise(body, {
          trim: true,
          explicitArray: false,
        }))
        .then(res => resolve(res))
        .catch(err => {
          this.platform.log.error('Device: %s, API Call: %s, Error: ', this.hostname, endpoint, err.message);
          reject(err);
        });
    });
  }

  getAllChannels(): Promise<Array<DreamboxChannel>> {
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
                    reference: channelReference,
                  });
                }
              });
              this.platform.log.info('Device: %s, configured %d channel(s)', this.hostname, this.channels.length);
              resolve(this.channels);
            }
          }
        })
        .catch(reject);
    });
  }

  getDeviceInfo(callback) {
    this.log('getDeviceInfo');
    this.callEnigmaWebAPI('about')
      .then(res => {
        if (res && res.e2abouts && res.e2abouts.e2about) {
          // Device Info
          callback(null, {
            modelName: res.e2abouts.e2about.e2model,
            serialNumber: res.e2abouts.e2about.e2lanmac,
            firmwareRevision: res.e2abouts.e2about.e2enigmaversion,
          });
        }
      })
      .catch(err => callback(err));
  }

  getPowerState(callback) {
    this.callEnigmaWebAPI('powerstate')
      .then(res => {
        if (res && res.e2powerstate && res.e2powerstate.e2instandby) {
          this.powerState = res.e2powerstate.e2instandby === 'false';
          this.log('getPower: %s', this.getPowerStateString());
          callback(null, this.powerState);
        }
      })
      .catch(err => callback(err));
  }

  setPowerState(state, callback) {
    this.powerState = state;
    this.log('setPower: %s', this.getPowerStateString());
    this.callEnigmaWebAPI('powerstate', {
      newstate: (state ? '4' : '5'),
    })
      .then(() => callback(null, state))
      .catch(err => callback(err));
  }

  getMute(callback) {
    this.log('getMute: %s', this.getMuteString());
    callback(null, this.muteState);
  }

  setMute(state, callback) {
    this.muteState = state;
    this.log('setMute: %s', this.getMuteString());
    callback(null, this.muteState);
  }

  getVolume(callback) {
    this.log('getVolume: %s', this.volumeState);
    callback(null, this.volumeState);
  }

  setVolume(volume, callback) {
    this.volumeState = volume;
    this.log('setVolume: %s', this.volumeState);
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
                this.log('getChannel: %s :- %s (%s)', index, channel.name, channel.reference);
                this.channel = index;
                return true;
              }
            });
          }
          callback(null, this.channel);
        })
        .catch(err => {
          this.platform.log.error(err);
          callback(err);
        });
    } else {
      callback(null, this.channel);
    }
  }

  setChannelByRef(ref) {
    return this.callEnigmaWebAPI('zap', {
      sRef: ref,
    });
  }

  setChannel(channel, callback) {
    this.channel = channel;
    this.log('setChannel: %s', channel);
    this.setChannelByRef(this.channels[this.channel].reference)
      .then(() => callback(null, channel))
      .catch(err => callback(err));
  }

  setPowerMode(state, callback) {
    this.powerState = state;
    this.log('setPowerMode: %s', this.getPowerStateString());
    callback(null, state);
  }

  volumeSelectorPress(remoteKey, command, callback) {
    this.log('volumeSelectorPress: %s, command: %s', remoteKey, command);
    this.callEnigmaWebAPI('vol', {
      set: command,
    })
      .then(() => callback(null, remoteKey))
      .catch(err => callback(err));
  }

  remoteKeyPress(remoteKey, command, callback) {
    this.log('remoteKeyPress: %s, command: %s', remoteKey, command);
    this.callEnigmaWebAPI('remotecontrol', {
      command: command,
    })
      .then(() => callback(null, remoteKey))
      .catch(err => callback(err));
  }

}