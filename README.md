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
            "channels":[
                {
                    "name": "arte HD",
                    "ref": "1:0:19:283E:3FB:1:C00000:0:0:0:"
                }
            ],
            "mqttTopic": "dreambox"
        }
    ],
    "mqtt": true,
    "mqttBroker": "localhost",
    "mqttUsername": "root",
    "mqttPassword": "secret"
}
```

`name` - Accessory name to be used in the Home applicaiton. Should be unique.

`hostname` - IP or hostname of the device.

`port` (optional) - Enigma web interface port. Default `80`.

`username` (optional) - Username used to access the web interface of the device.

`password`(optional) - Password used to access the web interface of the device.

`bouquet` (optional) - By default the bouquet named `Favourites (TV)` will be imported. Configure the name shown in the dreambox GUI to import another bouquet. The number of imported channels is limited to 97 as homebridge cannot handle more. You can create custom bouquet to be used for homekit.

`channels` (optional) - Channels to be added as separate buttons
    
`name` - Unique channel name

`ref` - Channel reference as in the bouquet file

`mqttTopic`(optional) - MQTT device topic used to synchronise the power state and current channel with your device. Topics used: `<mqttTopic>/state/power` and `<mqttTopic>/state/channel`. Example accepted messages:
```
dreambox/state/power
{"powerstate": "On", "power": "True"}
{"powerstate": "Idle", "power": "False"}

dreambox/state/channel
{"is_crypted": "False", "epg_now_endtime": "12:30", "epg_next_title": "Einer von uns: Der Homo sapiens (2/5)", "epg_now_starttime": "11:35", "name": "arte HD", "epg_now_rest_sec": 1200, "pic": "", "epg_now_title": "Einer von uns: Der Homo sapiens (1/5)", "epg_now_duration": 3300, "epg_next_endtime": "13:30", "file_size": 0, "epg_next_starttime": "12:30", "provider": "ARD", "epg_next_duration": 3600, "epg_now_rest_min": 20, "epg_now_startendtime": "11:35 - 12:30", "epg_now_rest_proz": 63, "epg_next_startendtime": "12:30 - 13:30"}
```

`mqtt` (optional) - Connect to a MQTT broker and synchronise power and selected channel with it.

`mqttBroker` (optional) - MQTT broker hostname if not localhost

`mqttUsername` (optional) - Username to connect to the MQTT broker

`mqttPassword` (optional) - Password to connect to the MQTT broker

# Usage

Dreambox devices will be published as external accessory in order to be visible even if another plugin on the same homebridge instance has published TV-Appliances. Please add all devices manually in the Home app using the setup code written in log.

The plugin adds a dreambox remote in the control center. The play/pause button is used to show the menu. The physical volume buttons control the dreambox volume.

You can define channel buttons to switch directly to the configured channel when pressed.

If configured a MQTT broker can be used to synchronize the device status with Homebridge.

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
