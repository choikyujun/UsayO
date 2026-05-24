import { createRunOncePlugin, withPlugins } from '@expo/config-plugins';
import { withYuSayWidgetsIOS } from './withYuSayWidgetsIOS';
import { withYuSayWidgetsAndroid } from './withYuSayWidgetsAndroid';

const pkg = { name: 'withYuSayWidgets', version: '1.0.0' };

function withYuSayWidgets(config: any) {
  return withPlugins(config, [withYuSayWidgetsIOS, withYuSayWidgetsAndroid]);
}

export default createRunOncePlugin(withYuSayWidgets, pkg.name, pkg.version);
