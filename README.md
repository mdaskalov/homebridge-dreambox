# General

[![npm](https://img.shields.io/npm/dt/homebridge-dreambox.svg)](https://www.npmjs.com/package/homebridge-dreambox)
[![npm](https://img.shields.io/npm/v/homebridge-dreambox.svg)](https://www.npmjs.com/package/homebridge-dreambox)
[![GitHub pull requests](https://img.shields.io/github/issues-pr/mdaskalov/homebridge-dreambox.svg)](https://github.com/mdaskalov/homebridge-dreambox/pulls)
[![GitHub issues](https://img.shields.io/github/issues/mdaskalov/homebridge-dreambox.svg)](https://github.com/mdaskalov/homebridge-dreambox/issues)

Homebridge plugin to control your Dreambox as HomeKit TV-Appliance

# Installation

* install homebridge `npm install -g homebridge`
* install dreambox plugin `npm install -g homebridge-dreambox`
* update the configuration file, configure name and IP/Hostname of your dreambox as follows
* alternatively the [Homebridge Config UI X](https://github.com/oznu/homebridge-config-ui-x) can be used to install and configure

# Configuration

```
{
    "platform": "Dreambox"
    "devices": [
        {
            "name": "Dream",
            "hostname": "dm900"
        }
    ],
}
```

# Reference

[homebridge-lib](https://github.com/ebaauw/homebridge-lib)

[homebridge-ws](https://github.com/ebaauw/homebridge-ws)

[HomeKit-TV](https://github.com/KhaosT/HAP-NodeJS/blob/master/src/lib/gen/HomeKit-TV.ts)

[homebridge-sony-television](https://github.com/arnif/homebridge-sony-television)

[homebridge-denon-tv](https://github.com/grzegorz914/homebridge-denon-tv)

[homebridge-openwebif-tv](https://github.com/grzegorz914/homebridge-openwebif-tv)
