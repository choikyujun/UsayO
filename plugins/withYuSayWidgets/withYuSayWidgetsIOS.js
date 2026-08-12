"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.withYuSayWidgetsIOS = withYuSayWidgetsIOS;
const config_plugins_1 = require("@expo/config-plugins");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const APP_GROUP = 'group.com.usayo.app';
const EXT_NAME = 'YuSayWidget';
const SRC = path.join(__dirname, '..', '..', 'widget-extension', 'ios');
const MODULE_IOS_SRC = path.join(__dirname, '..', '..', 'modules', 'YuSayWidgetBridge', 'ios');
function withYuSayWidgetsIOS(config) {
    // 1. Add App Groups entitlement to main app
    config = (0, config_plugins_1.withEntitlementsPlist)(config, (mod) => {
        const key = 'com.apple.security.application-groups';
        const existing = mod.modResults[key];
        const groups = Array.isArray(existing) ? existing : [];
        if (!groups.includes(APP_GROUP)) {
            mod.modResults[key] = [...groups, APP_GROUP];
        }
        return mod;
    });
    // 2. Write widget source files into ios/YuSayWidget/
    config = (0, config_plugins_1.withDangerousMod)(config, [
        'ios',
        (mod) => {
            const projectRoot = mod.modRequest.projectRoot;
            const extDir = path.join(projectRoot, 'ios', EXT_NAME);
            fs.mkdirSync(extDir, { recursive: true });
            const swiftFiles = [
                'YuSayWidget.swift',
                'WidgetViews.swift',
                'WidgetDataModel.swift',
            ];
            for (const f of swiftFiles) {
                fs.copyFileSync(path.join(SRC, f), path.join(extDir, f));
            }
            fs.copyFileSync(path.join(SRC, 'Info.plist'), path.join(extDir, 'Info.plist'));
            fs.copyFileSync(path.join(SRC, 'YuSayWidget.entitlements'), path.join(extDir, `${EXT_NAME}.entitlements`));
            // Also copy bridge module Swift source so main target compiles it
            const mainIosDir = path.join(projectRoot, 'ios');
            fs.copyFileSync(path.join(MODULE_IOS_SRC, 'YuSayWidgetBridgeModule.swift'), path.join(mainIosDir, 'YuSayWidgetBridgeModule.swift'));
            return mod;
        },
    ]);
    // 3. Add WidgetKit extension target to Xcode project
    config = (0, config_plugins_1.withXcodeProject)(config, (mod) => {
        var _a, _b;
        const xcodeProject = mod.modResults;
        const bundleId = (_b = (_a = mod.ios) === null || _a === void 0 ? void 0 : _a.bundleIdentifier) !== null && _b !== void 0 ? _b : 'com.usayo.app';
        const extBundleId = `${bundleId}.widget`;
        // Avoid double-adding
        const targets = xcodeProject.pbxNativeTargetSection();
        const alreadyAdded = Object.values(targets).some((t) => t && t.name === EXT_NAME);
        if (alreadyAdded)
            return mod;
        // Add target
        const target = xcodeProject.addTarget(EXT_NAME, 'app_extension', EXT_NAME, extBundleId);
        // Add Swift source files to the new target
        const sourceFiles = [
            'YuSayWidget.swift',
            'WidgetViews.swift',
            'WidgetDataModel.swift',
        ];
        for (const file of sourceFiles) {
            xcodeProject.addSourceFile(`${EXT_NAME}/${file}`, { target: target.uuid }, target.pbxGroupKey);
        }
        // Add Info.plist as resource
        xcodeProject.addResourceFile(`${EXT_NAME}/Info.plist`, { target: target.uuid }, target.pbxGroupKey);
        // Add WidgetKit + SwiftUI framework to the extension target
        xcodeProject.addFramework('WidgetKit.framework', { target: target.uuid, weak: false });
        xcodeProject.addFramework('SwiftUI.framework', { target: target.uuid, weak: false });
        // Also add WidgetKit to the main app target (needed for WidgetCenter in bridge)
        xcodeProject.addFramework('WidgetKit.framework', { weak: false });
        // Set build settings on extension target
        const buildConfigs = xcodeProject.pbxXCBuildConfigurationSection();
        Object.entries(buildConfigs).forEach(([, cfg]) => {
            if (!cfg || !cfg.buildSettings)
                return;
            if (cfg.buildSettings.PRODUCT_NAME === `"${EXT_NAME}"` ||
                cfg.buildSettings.PRODUCT_BUNDLE_IDENTIFIER === extBundleId) {
                Object.assign(cfg.buildSettings, {
                    SWIFT_VERSION: '5.0',
                    TARGETED_DEVICE_FAMILY: '"1,2"',
                    INFOPLIST_FILE: `"${EXT_NAME}/Info.plist"`,
                    'CODE_SIGN_ENTITLEMENTS[sdk=iphoneos*]': `"${EXT_NAME}/${EXT_NAME}.entitlements"`,
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
