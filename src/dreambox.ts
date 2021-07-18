import { DreamboxPlatform } from './platform';
import { parseStringPromise } from 'xml2js';
import { URL, URLSearchParams } from 'url';
import fetch from 'node-fetch';
import { LogLevel } from 'homebridge';

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

  public mqttPowerHandler?: PowerHandlerCallback;
  public mqttChannelHandler?: ChannelHandlerCallback;

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
        this.log(LogLevel.DEBUG, 'MQTT Power: %s', this.powerState ? 'ON' : 'STANDBY');
        if (this.mqttPowerHandler) {
          this.mqttPowerHandler(this.powerState);
        }
      });
      platform.mqttClient.mqttSubscribe(topic + '/state/channel', (topic, message) => {
        const msg = JSON.parse(message);
        const index = this.channels.findIndex(channel => channel.name === msg.name);
        if (index !== -1) {
          this.channel = index;
          this.log(LogLevel.DEBUG, 'MQTT Channel: %s', this.getCurrentChannel());
          if (this.mqttChannelHandler) {
            this.mqttChannelHandler(this.channel);
          }
          return true;
        }
      });
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  log(level: LogLevel, message: string, ...parameters: any[]): void {
    this.platform.log.log(level, '%s :- ' + message, this.hostname,
      ...parameters,
    );
  }

  getCurrentChannel(): string {
    if (typeof this.channels[this.channel] === 'undefined') {
      return 'no channel with index: ' + this.channel;
    } else {
      const name = this.channels[this.channel].name;
      const reference = this.channels[this.channel].reference;
      return this.channel + ' :- ' + name + ' (' + reference + ')';
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async callEnigmaWebAPI(path: string, searchParams: URLSearchParams | undefined = undefined): Promise<any> {
    const url = new URL('/web/' + path, 'http://' + this.hostname);
    if (this.username && this.password) {
      url.username = this.username;
      url.password = this.password;
    }
    if (url.port !== undefined) {
      url.port = this.port;
    }
    if (searchParams !== undefined) {
      url.search = searchParams.toString();
    }

    this.log(LogLevel.DEBUG, 'callEnigmaWebAPI: %s', url.href);

    try {
      const response = await fetch(url.href);
      const body = await response.text();
      const res = await parseStringPromise(body, { trim: true, explicitArray: false });
      if (!res) {
        throw new Error('callEnigmaWebAPI: unexpected response');
      }
      return res;
    } catch (err) {
      throw new Error(err.message);
    }
  }

  async getAllChannels(): Promise<Array<DreamboxChannel>> {
    try {
      const res = await this.callEnigmaWebAPI('getallservices');
      if (res.e2servicelistrecursive && res.e2servicelistrecursive.e2bouquet) {
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
          this.log(LogLevel.INFO, 'configured %d channel(s)', this.channels.length);
          return this.channels;
        }
      }
      this.log(LogLevel.ERROR, 'getAllChannels: unexpected answer');
    } catch (err) {
      this.log(LogLevel.ERROR, 'getAllChannels: ' + err.message);
    }
    return [];
  }

  async getDeviceInfo(): Promise<DeviceInfo> {
    try {
      const res = await this.callEnigmaWebAPI('about');
      if (res.e2abouts && res.e2abouts.e2about) {
        const deviceInfo = {
          modelName: res.e2abouts.e2about.e2model,
          serialNumber: res.e2abouts.e2about.e2lanmac,
          firmwareRevision: res.e2abouts.e2about.e2enigmaversion,
        };
        return deviceInfo;
      }
      this.log(LogLevel.ERROR, 'getDeviceInfo: unexpected answer');
    } catch (err) {
      this.log(LogLevel.ERROR, 'getDeviceInfo: ' + err.message);
    }
    return {
      modelName: 'dreambox',
      serialNumber: 'unknown',
      firmwareRevision: 'unknown',
    };
  }

  async getPowerState(): Promise<boolean> {
    const res = await this.callEnigmaWebAPI('powerstate');
    if (res.e2powerstate && res.e2powerstate.e2instandby) {
      this.powerState = res.e2powerstate.e2instandby === 'false';
      return this.powerState;
    }
    this.log(LogLevel.ERROR, 'getPowerState: unexpected answer');
    return this.powerState;
  }

  async setPowerState(state: boolean) {
    this.powerState = state;
    const params = new URLSearchParams();
    params.append('newstate', state ? '4' : '5');
    await this.callEnigmaWebAPI('powerstate', params);
  }

  async getChannel(): Promise<number> {
    if (this.powerState) {
      const res = await this.callEnigmaWebAPI('getcurrent');
      if (res.e2currentserviceinformation && res.e2currentserviceinformation.e2service) {
        const reference = res.e2currentserviceinformation.e2service.e2servicereference;
        const index = this.channels.findIndex(channel => channel.reference === reference);
        if (index !== -1) {
          this.channel = index;
          this.log(LogLevel.DEBUG, 'getChannel: found: %s', this.getCurrentChannel());
        } else {
          this.log(LogLevel.DEBUG, 'getChannel: not found: %s', reference);
        }
      }
    }
    return this.channel;
  }

  async setChannelByRef(ref: string) {
    const params = new URLSearchParams();
    params.append('sRef', ref);
    await this.callEnigmaWebAPI('zap', params);
  }

  async setChannel(channel: number) {
    this.channel = channel;
    await this.setChannelByRef(this.channels[this.channel].reference);
  }

  async remoteKeyPress(command: number) {
    const params = new URLSearchParams();
    params.append('command', command.toString());
    await this.callEnigmaWebAPI('remotecontrol', params);
  }

  async volumeSelectorPress(command: string) {
    const params = new URLSearchParams();
    params.append('command', command);
    await this.callEnigmaWebAPI('vol', params);
  }

}