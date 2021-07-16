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

export type DeviceInfo = {
  modelName: string,
  serialNumber: string,
  firmwareRevision: string,
}

type PowerHandlerCallback =
  (power: boolean) => void;

type ChannelHandlerCallback =
  (channel: number) => void;

export class Dreambox {
  public powerState = false;
  public muteState = false;
  public volumeState = 0;

  private channel = 0;
  private channels: Array<DreamboxChannel> = [];

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
    this.name = device['name'];
    this.hostname = device['hostname'];
    this.uuid = platform.api.hap.uuid.generate(this.hostname + ':' + this.name);

    this.port = device['port'];
    this.username = device['username'];
    this.password = device['password'];
    this.bouquet = device['bouquet'] || 'Favourites (TV)';

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

  async getAllChannels(): Promise<Array<DreamboxChannel>> {
    const res = await this.callEnigmaWebAPI('getallservices');
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
        return this.channels;
      }
    }
    throw new Error('getallservices command failed: ' + JSON.stringify(res));
  }

  async getDeviceInfo(): Promise<DeviceInfo> {
    const res = await this.callEnigmaWebAPI('about');
    if (res && res.e2abouts && res.e2abouts.e2about) {
      const deviceInfo = {
        modelName: res.e2abouts.e2about.e2model,
        serialNumber: res.e2abouts.e2about.e2lanmac,
        firmwareRevision: res.e2abouts.e2about.e2enigmaversion,
      };
      return deviceInfo;
    }
    throw new Error('about command failed: ' + JSON.stringify(res));
  }

  async getPowerState(): Promise<boolean> {
    const res = await this.callEnigmaWebAPI('powerstate');
    if (res && res.e2powerstate && res.e2powerstate.e2instandby) {
      this.powerState = res.e2powerstate.e2instandby === 'false';
      this.log('getPower: %s', this.getPowerStateString());
      return this.powerState;
    }
    throw new Error('powerstate command failed: ' + JSON.stringify(res));
  }

  async setPowerState(state: boolean) {
    this.powerState = state;
    this.log('setPower: %s', this.getPowerStateString());
    await this.callEnigmaWebAPI('powerstate', {
      newstate: (state ? '4' : '5'),
    });
  }

  async getChannel(): Promise<number> {
    if (this.powerState) {
      const res = await this.callEnigmaWebAPI('getcurrent');
      if (res && res.e2currentserviceinformation && res.e2currentserviceinformation.e2service) {
        const reference = res.e2currentserviceinformation.e2service.e2servicereference;
        this.channels.find((channel, index) => {
          if (channel.reference === reference) {
            this.log('getChannel: %s :- %s (%s)', index, channel.name, channel.reference);
            this.channel = index;
            return this.channel;
          }
        });
        this.log('getChannel: not found %s.', reference);
        return this.channel;
      }
      throw new Error('getcurrent command failed: ' + JSON.stringify(res));
    } else {
      return this.channel;
    }
  }

  async setChannelByRef(ref: string) {
    await this.callEnigmaWebAPI('zap', {
      sRef: ref,
    });
  }

  async setChannel(channel: number) {
    this.channel = channel;
    this.log('setChannel: %s', channel);
    await this.setChannelByRef(this.channels[this.channel].reference);
  }

  async remoteKeyPress(command: number) {
    this.log('remoteKeyPress: command: %s', command);
    await this.callEnigmaWebAPI('remotecontrol', {
      command: command,
    });
  }

  async volumeSelectorPress(command: string) {
    this.log('volumeSelectorPress: command: %s', command);
    await this.callEnigmaWebAPI('vol', {
      set: command,
    });
  }

}