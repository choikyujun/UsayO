const { withEntitlementsPlist, withXcodeProject, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const APP_GROUP = 'group.com.yusay.app';
const EXT_NAME = 'YuSayWidget';
const SRC = path.join(__dirname, '..', '..', 'widget-extension', 'ios');
const MODULE_IOS_SRC = path.join(__dirname, '..', '..', 'modules', 'YuSayWidgetBridge', 'ios');

function withYuSayWidgetsIOS(config) {
  // 1. Add App Groups entitlement to main app
  config = withEntitlementsPlist(config, (mod) => {
    const key = 'com.apple.security.application-groups';
    const existing = mod.modResults[key];
    const groups = Array.isArray(existing) ? existing : [];
    if (!groups.includes(APP_GROUP)) {
      mod.modResults[key] = [...groups, APP_GROUP];
    }
    return mod;
  });

  // 2. Write widget Swift source files into ios/YuSayWidget/
  config = withDangerousMod(config, [
    'ios',
    (mod) => {
      const projectRoot = mod.modRequest.projectRoot;
      const extDir = path.join(projectRoot, 'ios', EXT_NAME);
      fs.mkdirSync(extDir, { recursive: true });

      for (const file of ['YuSayWidget.swift', 'WidgetViews.swift', 'WidgetDataModel.swift']) {
        fs.copyFileSync(path.join(SRC, file), path.join(extDir, file));
      }
      fs.copyFileSync(path.join(SRC, 'Info.plist'), path.join(extDir, 'Info.plist'));
      fs.copyFileSync(
        path.join(SRC, 'YuSayWidget.entitlements'),
        path.join(extDir, `${EXT_NAME}.entitlements`),
      );

      // Copy bridge module Swift source into main ios/ dir so it compiles with the main target
      fs.copyFileSync(
        path.join(MODULE_IOS_SRC, 'YuSayWidgetBridgeModule.swift'),
        path.join(projectRoot, 'ios', 'YuSayWidgetBridgeModule.swift'),
      );

      return mod;
    },
  ]);

  // 3. Add YuSayWidget extension target to Xcode project
  config = withXcodeProject(config, (mod) => {
    const xcodeProject = mod.modResults;
    const bundleId =
      (mod.ios && mod.ios.bundleIdentifier) ||
      (mod.modRequest && mod.modRequest.projectConfig && mod.modRequest.projectConfig.bundleIdentifier) ||
      'com.yusay.app';
    const extBundleId = `${bundleId}.widget`;

    // Guard: avoid double-adding the target (xcode stores names with surrounding quotes)
    const targets = xcodeProject.pbxNativeTargetSection();
    const alreadyAdded = Object.values(targets).some(
      (t) => t && (t.name === EXT_NAME || t.name === `"${EXT_NAME}"`),
    );
    if (alreadyAdded) return mod;

    // Add extension target
    const target = xcodeProject.addTarget(
      EXT_NAME,
      'app_extension',
      EXT_NAME,
      extBundleId,
    );

    // Add Swift source files via build phase (addSourceFile requires a group key that addTarget doesn't return)
    xcodeProject.addBuildPhase(
      ['YuSayWidget.swift', 'WidgetViews.swift', 'WidgetDataModel.swift'].map((f) => `${EXT_NAME}/${f}`),
      'PBXSourcesBuildPhase',
      'Sources',
      target.uuid,
    );

    // Info.plist as resource build phase
    xcodeProject.addBuildPhase(
      [`${EXT_NAME}/Info.plist`],
      'PBXResourcesBuildPhase',
      'Resources',
      target.uuid,
    );

    // Frameworks: extension target needs WidgetKit + SwiftUI
    xcodeProject.addFramework('WidgetKit.framework', { target: target.uuid, weak: false });
    xcodeProject.addFramework('SwiftUI.framework',   { target: target.uuid, weak: false });

    // Main app target also needs WidgetKit (for WidgetCenter.reloadAllTimelines in bridge)
    xcodeProject.addFramework('WidgetKit.framework', { weak: false });

    // Patch build settings on the extension target's configurations
    const buildConfigs = xcodeProject.pbxXCBuildConfigurationSection();
    Object.values(buildConfigs).forEach((cfg) => {
      if (!cfg || !cfg.buildSettings) return;
      const bs = cfg.buildSettings;
      if (
        bs.PRODUCT_NAME === `"${EXT_NAME}"` ||
        bs.PRODUCT_BUNDLE_IDENTIFIER === extBundleId ||
        bs.PRODUCT_BUNDLE_IDENTIFIER === `"${extBundleId}"`
      ) {
        Object.assign(bs, {
          SWIFT_VERSION: '5.0',
          TARGETED_DEVICE_FAMILY: '"1,2"',
          INFOPLIST_FILE: `"${EXT_NAME}/Info.plist"`,
          CODE_SIGN_ENTITLEMENTS: `"${EXT_NAME}/${EXT_NAME}.entitlements"`,
          SKIP_INSTALL: 'YES',
          MARKETING_VERSION: '$(MARKETING_VERSION)',
          CURRENT_PROJECT_VERSION: '$(CURRENT_PROJECT_VERSION)',
        });
      }
    });

    return mod;
  });

  return config;
}

module.exports = { withYuSayWidgetsIOS };
