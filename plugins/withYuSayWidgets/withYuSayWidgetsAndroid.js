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
exports.withYuSayWidgetsAndroid = withYuSayWidgetsAndroid;
const config_plugins_1 = require("@expo/config-plugins");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const SRC = path.join(__dirname, '..', '..', 'widget-extension', 'android');
function withYuSayWidgetsAndroid(config) {
    config = (0, config_plugins_1.withAndroidManifest)(config, (mod) => {
        var _a, _b, _c;
        const manifest = mod.modResults;
        const app = config_plugins_1.AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);
        const receivers = ((_a = app.receiver) !== null && _a !== void 0 ? _a : (app.receiver = []));
        function ensureReceiver(name, metaResource) {
            const exists = receivers.some((r) => { var _a, _b; return (_b = (_a = r.$) === null || _a === void 0 ? void 0 : _a['android:name']) === null || _b === void 0 ? void 0 : _b.includes(name); });
            if (exists)
                return;
            receivers.push({
                $: {
                    'android:name': `.widget.${name}`,
                    'android:exported': 'true',
                },
                'intent-filter': [
                    {
                        action: [
                            { $: { 'android:name': 'android.appwidget.action.APPWIDGET_UPDATE' } },
                        ],
                    },
                ],
                'meta-data': [
                    {
                        $: {
                            'android:name': 'android.appwidget.provider',
                            'android:resource': `@xml/${metaResource}`,
                        },
                    },
                ],
            });
        }
        // Small 위젯 제거 — Medium(4x2↔4x4 리사이즈) 하나로 통일.
        ensureReceiver('YuSayMediumWidget', 'widget_medium_info');
        // 컬렉션(ListView) 어댑터 서비스 — RemoteViewsService는 BIND_REMOTEVIEWS 권한이 필요.
        const services = ((_b = app.service) !== null && _b !== void 0 ? _b : (app.service = []));
        const svcExists = services.some((s) => { var _a, _b; return (_b = (_a = s.$) === null || _a === void 0 ? void 0 : _a['android:name']) === null || _b === void 0 ? void 0 : _b.includes('WidgetListService'); });
        if (!svcExists) {
            services.push({
                $: {
                    'android:name': '.widget.WidgetListService',
                    'android:permission': 'android.permission.BIND_REMOTEVIEWS',
                    'android:exported': 'false',
                },
            });
        }
        // WidgetActionReceiver — 리스트 클릭 브로드캐스트 수신(항목 열기 / 완료 처리). provider가
        // 아니므로 intent-filter 없이 명시적 PendingIntent로만 호출된다(exported=false).
        const actExists = receivers.some((r) => { var _a, _b; return (_b = (_a = r.$) === null || _a === void 0 ? void 0 : _a['android:name']) === null || _b === void 0 ? void 0 : _b.includes('WidgetActionReceiver'); });
        if (!actExists) {
            receivers.push({
                $: {
                    'android:name': '.widget.WidgetActionReceiver',
                    'android:exported': 'false',
                },
            });
        }
        // WidgetConfigActivity — 투명도 슬라이더
        const activities = ((_c = app.activity) !== null && _c !== void 0 ? _c : (app.activity = []));
        const configExists = activities.some((a) => { var _a, _b; return (_b = (_a = a.$) === null || _a === void 0 ? void 0 : _a['android:name']) === null || _b === void 0 ? void 0 : _b.includes('WidgetConfigActivity'); });
        if (!configExists) {
            activities.push({
                $: {
                    'android:name': '.widget.WidgetConfigActivity',
                    'android:exported': 'true',
                    'android:theme': '@android:style/Theme.Material.Light.Dialog',
                },
                'intent-filter': [
                    {
                        action: [
                            { $: { 'android:name': 'android.appwidget.action.APPWIDGET_CONFIGURE' } },
                        ],
                    },
                ],
            });
        }
        return mod;
    });
    config = (0, config_plugins_1.withDangerousMod)(config, [
        'android',
        (mod) => {
            const projectRoot = mod.modRequest.projectRoot;
            const javaDir = path.join(projectRoot, 'android', 'app', 'src', 'main', 'java', 'com', 'usayo', 'app', 'widget');
            const resDir = path.join(projectRoot, 'android', 'app', 'src', 'main', 'res');
            fs.mkdirSync(javaDir, { recursive: true });
            fs.mkdirSync(path.join(resDir, 'layout'), { recursive: true });
            fs.mkdirSync(path.join(resDir, 'xml'), { recursive: true });
            fs.mkdirSync(path.join(resDir, 'drawable'), { recursive: true });
            // Copy Kotlin sources (Small 제거, 컬렉션 서비스 추가)
            for (const file of [
                'WidgetDataManager.kt',
                'YuSayMediumWidget.kt',
                'WidgetListService.kt',
                'WidgetActionReceiver.kt',
                'WidgetConfigActivity.kt',
            ]) {
                fs.copyFileSync(path.join(SRC, file), path.join(javaDir, file));
            }
            // 브릿지 모듈(YuSayWidgetBridgeModule.kt)은 :app 에 복사하지 않는다. autolink된
            // :yusay-widget-bridge 가 이 Expo 모듈을 제공/등록하며, :app 에도 두면 duplicate-class 로
            // 빌드가 실패한다. (:app 는 위젯 provider/res/manifest만 담당)
            // Copy layout XMLs (컬렉션 위젯 루트 + 아이템 row 레이아웃들)
            for (const file of [
                'widget_medium.xml',
                'widget_row_day.xml',
                'widget_row_event.xml',
                'widget_row_now.xml',
                'widget_row_empty.xml',
            ]) {
                fs.copyFileSync(path.join(SRC, 'res', 'layout', file), path.join(resDir, 'layout', file));
            }
            // Copy XML resources
            for (const file of ['widget_medium_info.xml']) {
                fs.copyFileSync(path.join(SRC, 'res', 'xml', file), path.join(resDir, 'xml', file));
            }
            // Copy drawables (벡터 아이콘·배경). widget-extension/android/res/drawable 전체를 복사.
            const srcDrawable = path.join(SRC, 'res', 'drawable');
            for (const file of fs.readdirSync(srcDrawable)) {
                fs.copyFileSync(path.join(srcDrawable, file), path.join(resDir, 'drawable', file));
            }
            return mod;
        },
    ]);
    return config;
}
