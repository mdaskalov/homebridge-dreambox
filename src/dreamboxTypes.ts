export type DreamboxDeviceChannel = {
  name: string;
  ref: string;
};

export type DreamboxDevice = {
  name: string;
  hostname: string;
  port?: number;
  username?: string;
  password?: string;
  bouquet?: string;
  channels?: Array<DreamboxDeviceChannel>;
  updateInterval?: number;
  offWhenUnreachable?: boolean;
  mqttTopic?: string;
};

export type DeviceInfo = {
  modelName: string;
  serialNumber: string;
  firmwareRevision: string;
};

export type DeviceState = {
  power: boolean;
  mute: boolean;
  volume: number;
  channel: number;
};

export type DeviceStateHandler = (state: DeviceState) => void;

// Enigma2 web interface XML responses

export type E2About = {
  e2abouts: {
    e2about: {
      e2model: string;
      e2lanmac: string;
      e2enigmaversion: string;
    };
  };
};

export type E2Service = {
  e2servicereference: string;
  e2servicename: string;
};

export type E2Bouquet = {
  e2servicereference: string;
  e2servicename: string;
  e2servicelist: {
    e2service: Array<E2Service>;
  };
};

export type E2ServiceList = {
  e2servicelistrecursive: {
    e2bouquet: Array<E2Bouquet>;
  };
};

export type E2Volume = {
  e2volume: {
    e2result: boolean;
    e2resulttext: string;
    e2current: number;
    e2ismuted: boolean;
  };
};

export type E2PowerState = {
  e2powerstate: {
    e2instandby: boolean;
  };
};

export type E2CurrentServiceInfo = {
  e2currentserviceinformation: {
    e2service: {
      e2servicereference: string;
    };
  };
};
