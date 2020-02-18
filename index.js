const DreamboxPlatform = require('./dreambox-platform').DreamboxPlatform;

module.exports = function (homebridge) {
  // For platform plugin to be considered as dynamic platform plugin,
  // registerPlatform(pluginName, platformName, constructor, dynamic), dynamic must be true
  homebridge.registerPlatform(
    "homebridge-dreambox",
    "Dreambox",
    DreamboxPlatform,
    true
  );
}