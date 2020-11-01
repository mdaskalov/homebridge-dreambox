const {
  PLUGIN_NAME,
  PLATFORM_NAME,
  DreamboxPlatform
} = require('./dreambox-platform');

module.exports = homebridge => {
  // For platform plugin to be considered as dynamic platform plugin,
  // registerPlatform(pluginName, platformName, constructor, dynamic), dynamic must be true
  homebridge.registerPlatform(
    PLUGIN_NAME,
    PLATFORM_NAME,
    DreamboxPlatform,
    true
  );
};