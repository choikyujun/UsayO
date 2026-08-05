import ExpoModulesCore
import WidgetKit

private let appGroup = "group.com.yusay.app"
private let widgetDataKey = "yusay_widget_data"

public class YuSayWidgetBridgeModule: Module {
  public func definition() -> ModuleDefinition {
    Name("YuSayWidgetBridge")

    // JS에서 직렬화한 JSON 문자열을 그대로 받아 저장한다(A′ — Android와 시그니처 정합).
    // 읽기 측 WidgetDataModel.load()가 이 문자열을 JSONDecoder로 파싱.
    AsyncFunction("updateWidget") { (data: String) in
      let defaults = UserDefaults(suiteName: appGroup)
      defaults?.set(data, forKey: widgetDataKey)
      defaults?.synchronize()

      if #available(iOS 14.0, *) {
        WidgetCenter.shared.reloadAllTimelines()
      }
    }

    AsyncFunction("clearWidget") { in
      let defaults = UserDefaults(suiteName: appGroup)
      defaults?.removeObject(forKey: widgetDataKey)
      defaults?.synchronize()

      if #available(iOS 14.0, *) {
        WidgetCenter.shared.reloadAllTimelines()
      }
    }
  }
}
