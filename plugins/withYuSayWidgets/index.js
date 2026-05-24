const { createRunOncePlugin, withPlugins } = require('@expo/config-plugins');
const { withYuSayWidgetsIOS } = require('./withYuSayWidgetsIOS');
const { withYuSayWidgetsAndroid } = require('./withYuSayWidgetsAndroid');

function withYuSayWidgets(config) {
  return withPlugins(config, [withYuSayWidgetsIOS, withYuSayWidgetsAndroid]);
}

module.exports = createRunOncePlugin(withYuSayWidgets, 'withYuSayWidgets', '1.0.0');
