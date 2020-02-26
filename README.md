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
* alternatively use the great [Homebridge Config UI X](https://github.com/oznu/homebridge-config-ui-x) plugin to install and configure

# Configuration

```
{
    "platform": "Dreambox"
    "devices": [
        {
            "name": "Dreambox",
            "hostname": "dm900",
            "bouquet": "homekitFavorites"
        }
    ],
}
```
`name` - Accessory name to be used in the Home applicaiton. Should be unique.
`hostname` - IP or hostname of your device to be accessible from homebridge.
`bouquet` - the name of the bouquet containing the channels to be imported. The bouquet files are stored under `/etc/enigma2` as `userbouquet.{name}.tv`. Note: Bouquets created with the enigma2 GUI have a suffix `__tv_` and should be configured with this suffix. 

# Usage

Dreambox devices will be published as external accessory in orderd to be visible even if another plugin on the same homebridge instance has published TV-Appliances. Please add all devices manually in the Home app using the setup code written in log.

The channels are imported from the favorites bouquet if no bouquet is configured. The number of imported channels is limited to 97 as homebridge cannot handle more. You can create custom bouquet to be used with homekit.

# References

[homebridge-lib](https://github.com/ebaauw/homebridge-lib)

[homebridge-ws](https://github.com/ebaauw/homebridge-ws)

[HomeKit-TV](https://github.com/KhaosT/HAP-NodeJS/blob/master/src/lib/gen/HomeKit-TV.ts)

[Enigma2 WebInterface API Documentation](https://dream.reichholf.net/e2web/)

[Enigma2 WebInterface Wiki](https://dream.reichholf.net/wiki/Enigma2:WebInterface)

[homebridge-sony-television](https://github.com/arnif/homebridge-sony-television)

[homebridge-denon-tv](https://github.com/grzegorz914/homebridge-denon-tv)

[homebridge-openwebif-tv](https://github.com/grzegorz914/homebridge-openwebif-tv)
