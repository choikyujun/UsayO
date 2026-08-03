import SwiftUI
import WidgetKit

// MARK: — Widget background (iOS 17 containerBackground + <17 fallback)

extension View {
  // containerBackground(_:for:) 는 iOS 17.0+ 전용이라 배포타깃 15.1에서 무가드 호출 시
  // Swift 컴파일이 실패한다. iOS 17+에서는 컨테이너 배경을(시스템 요구), 그 이하(홈 위젯
  // 14+·잠금화면 16+)에서는 일반 배경으로 폴백해 하위 버전 렌더를 유지한다. (availability
  // 처리만 — 레이아웃·색상 불변)
  @ViewBuilder
  func widgetContainerBackground<S: ShapeStyle>(_ style: S) -> some View {
    if #available(iOSApplicationExtension 17.0, *) {
      self.containerBackground(style, for: .widget)
    } else {
      self.background(style)
    }
  }
}

// MARK: — Brand colors

private extension Color {
  static let yuDarkBg    = Color(hex: "0E0C1F")
  static let yuDarkCard  = Color(hex: "1A1830")
  static let yuPrimary   = Color(hex: "534AB7")
  static let yuAccent    = Color(hex: "AFA9EC")
  static let yuSuccess   = Color(hex: "1D9E75")
  static let yuText      = Color(hex: "EEEDFE")
  static let yuMuted     = Color(hex: "5B5880")
}

// MARK: — Small (2×2) ─────────────────────────────────────────

struct SmallWidgetView: View {
  let entry: YuSayEntry

  var body: some View {
    ZStack {
      Color.yuDarkBg
      VStack(spacing: 8) {
        Circle()
          .fill(Color.yuPrimary)
          .frame(width: 40, height: 40)
          .overlay(
            Image(systemName: "mic.fill")
              .foregroundColor(.white)
              .font(.system(size: 18, weight: .semibold))
          )
          .shadow(color: Color.yuPrimary.opacity(0.55), radius: 10, x: 0, y: 4)

        if let next = entry.data?.nextEvent {
          Text(formatWidgetTime(next.startAt))
            .font(.system(size: 12, weight: .semibold, design: .rounded))
            .foregroundColor(Color.yuAccent)
          Text(next.title)
            .font(.system(size: 12, weight: .medium))
            .foregroundColor(Color.yuText)
            .lineLimit(2)
            .multilineTextAlignment(.center)
        } else {
          Text("일정 없음")
            .font(.system(size: 12))
            .foregroundColor(Color.yuMuted)
        }
      }
      .padding(10)
    }
    .widgetURL(URL(string: "yusay://voice"))
    .widgetContainerBackground(Color.yuDarkBg)
  }
}

// MARK: — Medium (4×2) ────────────────────────────────────────

struct MediumWidgetView: View {
  let entry: YuSayEntry

  var body: some View {
    ZStack {
      Color.yuDarkBg
      HStack(spacing: 0) {
        // Left column: FAB + remaining count
        Link(destination: URL(string: "yusay://voice")!) {
          VStack(spacing: 6) {
            Circle()
              .fill(Color.yuPrimary)
              .frame(width: 44, height: 44)
              .overlay(
                Image(systemName: "mic.fill")
                  .foregroundColor(.white)
                  .font(.system(size: 20, weight: .semibold))
              )
              .shadow(color: Color.yuPrimary.opacity(0.55), radius: 10, x: 0, y: 4)

            let count = entry.data?.todayRemainingCount ?? 0
            Text("\(count)")
              .font(.system(size: 18, weight: .bold, design: .rounded))
              .foregroundColor(Color.yuText)
            Text("개 남음")
              .font(.system(size: 10))
              .foregroundColor(Color.yuMuted)
          }
          .frame(width: 76)
          .padding(.vertical, 10)
        }

        // Divider
        Rectangle()
          .fill(Color(hex: "18163A"))
          .frame(width: 1)
          .padding(.vertical, 12)

        // Right column: event list
        VStack(alignment: .leading, spacing: 6) {
          let events = entry.data?.todayEvents ?? []
          if events.isEmpty {
            Text("오늘 일정 없음")
              .font(.system(size: 12))
              .foregroundColor(Color.yuMuted)
              .padding(.leading, 12)
          } else {
            ForEach(events.prefix(3), id: \.id) { event in
              HStack(spacing: 8) {
                RoundedRectangle(cornerRadius: 2)
                  .fill(Color.yuPrimary)
                  .frame(width: 3, height: 32)
                VStack(alignment: .leading, spacing: 2) {
                  Text(formatWidgetTime(event.startAt))
                    .font(.system(size: 10))
                    .foregroundColor(Color.yuAccent)
                  Text(event.title)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(Color.yuText)
                    .lineLimit(1)
                }
              }
            }
          }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.leading, 10)
        .padding(.vertical, 10)
      }
      .padding(.horizontal, 10)
    }
    .widgetContainerBackground(Color.yuDarkBg)
  }
}

// MARK: — Lock Screen (accessoryRectangular, iOS 16+) ─────────

@available(iOSApplicationExtension 16.0, *)
struct LockScreenWidgetView: View {
  let entry: YuSayEntry

  var body: some View {
    HStack(spacing: 6) {
      Image(systemName: "mic.fill")
        .font(.system(size: 12, weight: .semibold))
      if let next = entry.data?.nextEvent {
        Text("\(formatWidgetTime(next.startAt))  \(next.title)")
          .font(.system(size: 13, weight: .medium))
          .lineLimit(1)
      } else {
        Text("UsayO · 일정 없음")
          .font(.system(size: 13))
      }
    }
    .widgetURL(URL(string: "yusay://voice"))
    .widgetContainerBackground(Color.clear)
  }
}
