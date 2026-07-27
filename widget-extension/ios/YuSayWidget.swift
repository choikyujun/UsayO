import SwiftUI
import WidgetKit

// MARK: — Timeline Entry

struct YuSayEntry: TimelineEntry {
  let date: Date
  let data: WidgetDataModel?
}

// MARK: — Timeline Provider

struct YuSayProvider: TimelineProvider {
  func placeholder(in context: Context) -> YuSayEntry {
    YuSayEntry(date: Date(), data: nil)
  }

  func getSnapshot(in context: Context, completion: @escaping (YuSayEntry) -> Void) {
    completion(YuSayEntry(date: Date(), data: WidgetDataModel.load()))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<YuSayEntry>) -> Void) {
    let entry = YuSayEntry(date: Date(), data: WidgetDataModel.load())
    let next = Calendar.current.date(byAdding: .minute, value: 15, to: Date())!
    completion(Timeline(entries: [entry], policy: .after(next)))
  }
}

// MARK: — Widget Definitions

struct YuSaySmallWidget: Widget {
  let kind = "YuSaySmall"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: YuSayProvider()) { entry in
      SmallWidgetView(entry: entry)
    }
    .configurationDisplayName("UsayO 스몰")
    .description("다음 일정 + 음성 버튼")
    .supportedFamilies([.systemSmall])
  }
}

struct YuSayMediumWidget: Widget {
  let kind = "YuSayMedium"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: YuSayProvider()) { entry in
      MediumWidgetView(entry: entry)
    }
    .configurationDisplayName("UsayO 미디엄")
    .description("오늘 일정 리스트")
    .supportedFamilies([.systemMedium])
  }
}

// MARK: — Widget Bundle

@main
struct YuSayWidgetBundle: WidgetBundle {
  var body: some Widget {
    YuSaySmallWidget()
    YuSayMediumWidget()
    if #available(iOSApplicationExtension 16.0, *) {
      YuSayLockScreenWidget()
    }
  }
}

// Defined in a conditional extension to avoid compiler warning on iOS <16
@available(iOSApplicationExtension 16.0, *)
struct YuSayLockScreenWidget: Widget {
  let kind = "YuSayLockScreen"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: YuSayProvider()) { entry in
      LockScreenWidgetView(entry: entry)
    }
    .configurationDisplayName("UsayO 잠금화면")
    .description("다음 일정 빠른 확인")
    .supportedFamilies([.accessoryRectangular])
  }
}
