import { DreamboxPlatform } from './platform';
import { DreamboxDevice } from './dreambox-accessory';
import { DreamboxDeviceChannel } from './channel-accessory';
import { XMLParser } from 'fast-xml-parser';
import { URL, URLSearchParams } from 'url';
import { LogLevel } from 'homebridge';

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

type E2About = {
  e2abouts: {
    e2about: {
      e2model: string,
      e2lanmac: string,
      e2enigmaversion: string,
    }
  }
}

type E2Service = {
  e2servicereference: string,
  e2servicename: string
}

type E2Bouquet = {
  e2servicereference: string,
  e2servicename: string,
  e2servicelist: {
    e2service: Array<E2Service>
  }
}

type E2ServiceList = {
  e2servicelistrecursive: {
    e2bouquet: Array<E2Bouquet>
  }
}

type E2PowerState = {
  e2powerstate: {
    e2instandby: string
  }
}

type E2CurrentServiceInfo = {
  e2currentserviceinformation: {
    e2service: {
      e2servicereference: string
    }
  }
}

export class Dreambox {
  public readonly name: string;
  public readonly hostname: string;
  public readonly bouquet: string;

  public readonly state: DeviceState = { power: false, mute: false, volume: 0, channel: 0 };
  public readonly deviceInfo: DeviceInfo = { modelName: 'Dreambox', serialNumber: 'Unknown', firmwareRevision: 'Unknown' };
  public readonly channels: Array<DreamboxDeviceChannel> = [];

  public deviceStateHandler?: DeviceStateHandler;

  private port?: number;
  private username?: string;
  private password?: string;
  private updateInterval: number;
  private offWhenUnreachable: boolean;

  private static abortTimeout = 3000;
  private static maxRetries = 3;
  private static retryDelay = 500;

  private xmlParser: XMLParser;

  constructor(protected readonly platform: DreamboxPlatform, protected readonly device: DreamboxDevice) {
    this.name = device.name || 'Dreambox';
    this.hostname = device.hostname;
    this.bouquet = device.bouquet || 'Favourites (TV)';

    this.port = device.port;
    this.username = device.username;
    this.password = device.password;
    this.updateInterval = device.updateInterval || 0;
    this.offWhenUnreachable = device.offWhenUnreachable || false;

    this.xmlParser = new XMLParser({ ignoreAttributes: false, trimValues: true });

    // Setup MQTT subscriptions
    if (platform.mqttClient && device.mqttTopic) {
      platform.mqttClient.mqttSubscribe(device.mqttTopic + '/state/power', (topic, message) => {
        const msg = JSON.parse(message);
        this.state.power = (msg.power === 'True');
        this.log(LogLevel.DEBUG, 'MQTT Power: %s', this.state.power ? 'ON' : 'STANDBY');
        if (this.deviceStateHandler) {
          this.deviceStateHandler(this.state);
        }
      });
      platform.mqttClient.mqttSubscribe(device.mqttTopic + '/state/channel', (topic, message) => {
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
    if (this.updateInterval && this.updateInterval > 0) {
      setInterval(async () => {
        try {
          await this.getPowerState();
          await this.getChannel();
          if (this.deviceStateHandler) {
            this.deviceStateHandler(this.state);
          }
        } catch (err) {
          this.log(LogLevel.DEBUG, 'Update: %s', this.strError(err));
        }
      }, this.updateInterval * 1000);
    }
  }

  private strError(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
  }

  log(level: LogLevel, message: string, ...parameters: unknown[]): void {
    this.platform.log.log(level, '%s :- ' + message, this.hostname,
      ...parameters,
    );
  }

  logError(method: string, err: unknown) {
    if (err instanceof Error) {
      this.log(LogLevel.ERROR, '%s: %s', method, this.strError(err));
    }
  }

  getCurrentChannelDescription(): string {
    if (typeof this.channels[this.state.channel] === 'undefined') {
      return 'no channel with index: ' + this.state.channel;
    } else {
      const name = this.channels[this.state.channel].name;
      const reference = this.channels[this.state.channel].ref;
      return this.state.channel + ' :- ' + name + ' (' + reference + ')';
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async fetchWithTimeoutRetry(url: string): Promise<Response> {
    let lastErr: unknown;
    for (let attempt = 0; attempt < Dreambox.maxRetries; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), Dreambox.abortTimeout);
      const init: RequestInit = {
        signal: controller.signal,
        ...(this.username && this.password && {
          headers: {
            'Authorization': 'Basic ' +
              Buffer.from(`${this.username}:${this.password}`).toString('base64'),
          },
        }),
      };

      try {
        const response = await fetch(url, init);
        return response;
      } catch (err) {
        lastErr = err;

        const isTimeout = err instanceof Error && err.name === 'AbortError';

        if (isTimeout) {
          this.log(LogLevel.DEBUG, `Timeout fetching ${url}, retrying (${attempt + 1}/${Dreambox.maxRetries})...`);
          if (attempt < Dreambox.maxRetries - 1) {
            await this.delay(Dreambox.retryDelay);
          }
        } else {
          throw err;
        }
      } finally {
        clearTimeout(timeout);
      }
    }
    throw lastErr;
  }

  async callEnigmaWebAPI(path: string, searchParams?: URLSearchParams): Promise<unknown> {
    const url = new URL(`/web/${path}`, `http://${this.hostname}`);
    if (this.port) {
      url.port = this.port.toString();
    }
    if (searchParams) {
      url.search = searchParams.toString();
    }
    try {
      const response = await this.fetchWithTimeoutRetry(url.href);
      if (response.status === 200) {
        const body = await response.text();
        return this.xmlParser.parse(body);
      } else {
        this.log(LogLevel.ERROR, 'callEnigmaWebAPI: http status: %s - check webinterface settings', response.status);
        return {};
      }
    } catch (err) {
      const message = (err instanceof Error && err.name === 'AbortError')
        ? `${url.href} :- Timeout`
        : this.strError(err);
      const pref = 'callEnigmaWebAPI: ' + (this.offWhenUnreachable ? 'off (unreachable): ' : '');

      if (this.offWhenUnreachable) {
        this.state.power = false;
        this.log(LogLevel.DEBUG, '%s%s', pref, message);
        return {};
      } else {
        throw new Error(pref + message);
      }
    }
  }

  async readDeviceInfo() {
    const res = await this.callEnigmaWebAPI('about') as E2About;
    if (res) {
      const { e2model, e2lanmac, e2enigmaversion } = res.e2abouts.e2about;
      this.deviceInfo.modelName = e2model;
      this.deviceInfo.serialNumber = e2lanmac;
      this.deviceInfo.firmwareRevision = e2enigmaversion;
      return;
    }
    throw Error('getDeviceInfo: Unexpected answer.');
  }

  async readChannels() {
    const res = await this.callEnigmaWebAPI('getallservices') as E2ServiceList;
    if (res) {
      const bouquet = res.e2servicelistrecursive.e2bouquet.find(b => b.e2servicename === this.bouquet);
      if (bouquet) {
        const services = bouquet.e2servicelist.e2service.filter(s => !s.e2servicereference.startsWith('1:64:'));
        const channels = services.map(s => ({ name: s.e2servicename, ref: s.e2servicereference }));
        this.channels.splice(0);
        this.channels.push(...channels);
        this.log(LogLevel.DEBUG, 'getAllChannels: got %d channel(s)', this.channels.length);
        return;
      }
      throw Error(`readChannels: Bouquet "${this.bouquet}" not found.`);
    }
    throw Error('readChannels: Unexpected answer.');
  }

  async getPowerState(): Promise<boolean> {
    const res = await this.callEnigmaWebAPI('powerstate') as E2PowerState;
    if (res) {
      this.state.power = res.e2powerstate.e2instandby === 'false';
    } else if (!this.offWhenUnreachable) {
      this.log(LogLevel.DEBUG, 'getPowerState: unexpected answer');
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
      const res = await this.callEnigmaWebAPI('getcurrent') as E2CurrentServiceInfo;
      if (res) {
        const reference = res.e2currentserviceinformation.e2service.e2servicereference;
        const index = this.channels.findIndex(channel => channel.ref === reference);
        if (index !== -1) {
          this.state.channel = index;
          this.log(LogLevel.DEBUG, 'getChannel: found at %s', this.getCurrentChannelDescription());
        } else {
          this.log(LogLevel.DEBUG, 'getChannel: not found: %s', reference);
        }
      } else if (!this.offWhenUnreachable) {
        this.log(LogLevel.DEBUG, 'getChannel: unexpected answer');
      }
    }
    return this.state.channel;
  }

  async setChannel(channel: number) {
    this.state.channel = channel;
    await this.setChannelByRef(this.channels[this.state.channel].ref);
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
    params.append('set', command);
    await this.callEnigmaWebAPI('vol', params);
  }

}