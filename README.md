# General

[![npm](https://img.shields.io/npm/dt/homebridge-dreambox.svg)](https://www.npmjs.com/package/homebridge-dreambox)
[![npm](https://img.shields.io/npm/v/homebridge-dreambox.svg)](https://www.npmjs.com/package/homebridge-dreambox)
[![Build Status](https://travis-ci.org/mdaskalov/homebridge-dreambox.svg?branch=master)](https://travis-ci.org/mdaskalov/homebridge-dreambox)
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
            "port": 80,
            "username": "user",
            "password": "password",
            "bouquet": "HomekitFavorites",
            "mqttTopic": "dreambox"
        }
    ],
    "mqtt": true
}
```

`name` - Accessory name to be used in the Home applicaiton. Should be unique.

`hostname` - IP or hostname of the device.

`port` (optional) - Enigma web interface port. Default `80`.

`username` (optional) - Username used to access the web interface of the device.

`password`(optional) - Password used to access the web interface of the device.

`bouquet` (optional) - By default the bouquet named `Favourites (TV)` will be imported. Configure the name as shown in the GUI to import another bouquet. The number of imported channels is limited to 97 as homebridge cannot handle more. You can create custom bouquet to be used for homekit.

`mqttTopic`(optional) - MQTT topic used to synchronise the power state and current channel with your device. Topics used: `<mqttTopic>/state/power` and `<mqttTopic>/state/channel` 

`mqtt` (optional) - Connect to a MQTT broker and synchronise power and selected channel with it.

# Usage

Dreambox devices will be published as external accessory in order to be visible even if another plugin on the same homebridge instance has published TV-Appliances. Please add all devices manually in the Home app using the setup code written in log.

The plugin adds a dreambox remote in the control center. The play/pause button is used to show the menu. The physical volume buttons control the dreambox volume.

# References

[homebridge-lib](https://github.com/ebaauw/homebridge-lib)

[homebridge-ws](https://github.com/ebaauw/homebridge-ws)

[HomeKit-TV](https://github.com/KhaosT/HAP-NodeJS/blob/master/src/lib/gen/HomeKit-TV.ts)

[Enigma2 WebInterface API Documentation](https://dream.reichholf.net/e2web/)

[Enigma2 WebInterface Wiki](https://dream.reichholf.net/wiki/Enigma2:WebInterface)

[OpenWebif API Documentation](https://github.com/E2OpenPlugins/e2openplugin-OpenWebif/wiki/OpenWebif-API-documentation)

[homebridge-sony-television](https://github.com/arnif/homebridge-sony-television)

[homebridge-denon-tv](https://github.com/grzegorz914/homebridge-denon-tv)

[homebridge-openwebif-tv](https://github.com/grzegorz914/homebridge-openwebif-tv)
