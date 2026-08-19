import Foundation

private let appGroup = "group.com.usayo.app"
private let widgetDataKey = "yusay_widget_data"

struct WidgetEventModel: Codable {
  let id: String
  let title: String
  let startAt: String
  let colorTag: String?

  enum CodingKeys: String, CodingKey {
    case id, title, colorTag
    case startAt = "startAt"
  }
}

struct WidgetDataModel: Codable {
  let nextEvent: WidgetEventModel?
  let todayEvents: [WidgetEventModel]
  let todayRemainingCount: Int
  let updatedAt: String

  static func load() -> WidgetDataModel? {
    guard
      let defaults = UserDefaults(suiteName: appGroup),
      let raw = defaults.string(forKey: widgetDataKey),
      let data = raw.data(using: .utf8)
    else { return nil }
    return try? JSONDecoder().decode(WidgetDataModel.self, from: data)
  }
}

// MARK: — Helpers

func formatWidgetTime(_ isoString: String) -> String {
  let formatter = ISO8601DateFormatter()
  formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
  guard let date = formatter.date(from: isoString) ?? {
    let f = ISO8601DateFormatter()
    return f.date(from: isoString)
  }() else { return "" }

  let out = DateFormatter()
  out.locale = Locale(identifier: "ko_KR")
  out.dateFormat = "HH:mm"
  return out.string(from: date)
}

// Hex color support for SwiftUI
import SwiftUI

extension Color {
  init(hex: String) {
    let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
    var int: UInt64 = 0
    Scanner(string: hex).scanHexInt64(&int)
    let r = Double((int >> 16) & 0xFF) / 255
    let g = Double((int >> 8) & 0xFF) / 255
    let b = Double(int & 0xFF) / 255
    self.init(red: r, green: g, blue: b)
  }
}
