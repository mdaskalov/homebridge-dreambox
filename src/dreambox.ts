import { DreamboxPlatform } from './platform';
import { parseStringPromise } from 'xml2js';
import { URL, URLSearchParams } from 'url';
import { AbortController } from 'abort-controller';
import fetch from 'node-fetch';
import { LogLevel } from 'homebridge';

type DreamboxChannel = {
  name: string,
  reference: string,
}

type DeviceInfo = {
  modelName: string,
  serialNumber: string,
  firmwareRevision: string,
}

type DeviceState = {
  power: boolean;
  mute: boolean;
  volume: number;
  channel: number;
}

type DeviceStateHandler =
  (state: DeviceState) => void;

type DeviceInfoHandler =
  (info: DeviceInfo) => void;

type DeviceChannelsHandler =
  (channels: Array<DreamboxChannel>) => void;

export class Dreambox {
  public state: DeviceState = { power: false, mute: false, volume: 0, channel: 0 };
  public deviceInfo = { modelName: 'dreambox', serialNumber: 'unknown', firmwareRevision: 'unknown' }
  public channels: Array<DreamboxChannel> = [];

  public deviceInfoHandler?: DeviceInfoHandler;
  public deviceChannelsHandler?: DeviceChannelsHandler;
  public deviceStateHandler?: DeviceStateHandler;

  public name: string;
  public hostname: string;
  public uuid: string;

  private port: string;
  private username: string;
  private password: string;
  private bouquet: string;
  private static retryTimeout = 30000;

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
        this.state.power = (msg.power === 'True');
        this.log(LogLevel.DEBUG, 'MQTT Power: %s', this.state.power ? 'ON' : 'STANDBY');
        if (this.deviceStateHandler) {
          this.deviceStateHandler(this.state);
        }
      });
      platform.mqttClient.mqttSubscribe(topic + '/state/channel', (topic, message) => {
        const msg = JSON.parse(message);
        const index = this.channels.findIndex(channel => channel.name === msg.name);
        if (index !== -1) {
          this.state.channel = index;
          this.log(LogLevel.DEBUG, 'MQTT Channel: %s', this.getCurrentChannelDescription());
          if (this.deviceStateHandler) {
            this.deviceStateHandler(this.state);
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

  getCurrentChannelDescription(): string {
    if (typeof this.channels[this.state.channel] === 'undefined') {
      return 'no channel with index: ' + this.state.channel;
    } else {
      const name = this.channels[this.state.channel].name;
      const reference = this.channels[this.state.channel].reference;
      return this.state.channel + ' :- ' + name + ' (' + reference + ')';
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

    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, 1500);

    try {
      const response = await fetch(url.href, { signal: controller.signal });
      const body = await response.text();
      const res = await parseStringPromise(body, { trim: true, explicitArray: false });
      if (!res) {
        throw new Error('callEnigmaWebAPI: unexpected response');
      }
      return res;
    } catch (err) {
      if (err.name === 'AbortError') {
        throw new Error('callEnigmaWebAPI: Timeout');
      } else {
        throw new Error(err.message);
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  async getAllChannels(): Promise<Array<DreamboxChannel>> {
    let updated = false;
    try {
      const res = await this.callEnigmaWebAPI('getallservices');
      if (res.e2servicelistrecursive && res.e2servicelistrecursive.e2bouquet) {
        updated = true;
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
          if (this.deviceChannelsHandler) {
            this.deviceChannelsHandler(this.channels);
          }
        }
      } else {
        this.log(LogLevel.DEBUG, 'getAllChannels: unexpected answer');
      }
    } catch (err) {
      this.log(LogLevel.DEBUG, 'getAllChannels: %s', err.message);
    }
    if (!updated) {
      this.log(LogLevel.DEBUG, 'getAllChannels: Failed. Will try later.');
      setTimeout(this.getAllChannels.bind(this), Dreambox.retryTimeout);
    }
    return this.channels;
  }

  async getDeviceInfo(): Promise<DeviceInfo> {
    let updated = false;
    try {
      const res = await this.callEnigmaWebAPI('about');
      if (res.e2abouts && res.e2abouts.e2about) {
        this.deviceInfo.modelName = res.e2abouts.e2about.e2model;
        this.deviceInfo.serialNumber = res.e2abouts.e2about.e2lanmac;
        this.deviceInfo.firmwareRevision = res.e2abouts.e2about.e2enigmaversion;
        updated = true;
        if (this.deviceInfoHandler) {
          this.deviceInfoHandler(this.deviceInfo);
        }
      } else {
        this.log(LogLevel.DEBUG, 'getDeviceInfo: unexpected answer');
      }
    } catch (err) {
      this.log(LogLevel.DEBUG, 'getDeviceInfo: %s', err.message);
    }
    if (!updated) {
      this.log(LogLevel.DEBUG, 'getDeviceInfo: Failed. Will try later.');
      setTimeout(this.getDeviceInfo.bind(this), Dreambox.retryTimeout);
    }
    return this.deviceInfo;
  }

  async getPowerState(): Promise<boolean> {
    const res = await this.callEnigmaWebAPI('powerstate');
    if (res.e2powerstate && res.e2powerstate.e2instandby) {
      this.state.power = res.e2powerstate.e2instandby === 'false';
    } else {
      this.log(LogLevel.ERROR, 'getPowerState: unexpected answer');

    }
    return this.state.power;
  }

  async setPowerState(state: boolean) {
    this.state.power = state;
    const params = new URLSearchParams();
    params.append('newstate', state ? '4' : '5');
    await this.callEnigmaWebAPI('powerstate', params);
  }

  async getChannel(): Promise<number> {
    if (this.state.power) {
      const res = await this.callEnigmaWebAPI('getcurrent');
      if (res.e2currentserviceinformation && res.e2currentserviceinformation.e2service) {
        const reference = res.e2currentserviceinformation.e2service.e2servicereference;
        const index = this.channels.findIndex(channel => channel.reference === reference);
        if (index !== -1) {
          this.state.channel = index;
          this.log(LogLevel.DEBUG, 'getChannel: found: %s', this.getCurrentChannelDescription());
        } else {
          this.log(LogLevel.DEBUG, 'getChannel: not found: %s', reference);
        }
      } else {
        this.log(LogLevel.ERROR, 'getChannel: unexpected answer');
      }
    }
    return this.state.channel;
  }

  async setChannel(channel: number) {
    this.state.channel = channel;
    await this.setChannelByRef(this.channels[this.state.channel].reference);
  }

  async setChannelByRef(ref: string) {
    const params = new URLSearchParams();
    params.append('sRef', ref);
    await this.callEnigmaWebAPI('zap', params);
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