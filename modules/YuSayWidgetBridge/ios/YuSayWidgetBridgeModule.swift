import ExpoModulesCore
import WidgetKit

private let appGroup = "group.com.yusay.app"
private let widgetDataKey = "yusay_widget_data"

public class YuSayWidgetBridgeModule: Module {
  public func definition() -> ModuleDefinition {
    Name("YuSayWidgetBridge")

    AsyncFunction("updateWidget") { (data: [String: Any]) throws in
      guard let jsonData = try? JSONSerialization.data(withJSONObject: data),
            let jsonString = String(data: jsonData, encoding: .utf8) else {
        throw NSError(domain: "YuSayWidgetBridge", code: 1,
                      userInfo: [NSLocalizedDescriptionKey: "Failed to serialize widget data"])
      }
      let defaults = UserDefaults(suiteName: appGroup)
      defaults?.set(jsonString, forKey: widgetDataKey)
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
