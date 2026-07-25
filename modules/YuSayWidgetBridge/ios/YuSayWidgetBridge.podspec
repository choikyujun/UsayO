require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'YuSayWidgetBridge'
  s.version        = package['version']
  s.summary        = 'YuSay widget data bridge — writes to App Groups UserDefaults'
  s.homepage       = 'https://github.com/yourusername/yusay'
  s.license        = package['license']
  s.authors        = package['author']
  s.platforms      = { ios: '14.0' }
  s.source         = { git: '' }
  s.source_files   = '*.swift'
  s.dependency 'ExpoModulesCore'
end
