import AppKit
import WebKit
import Foundation

@MainActor
final class StudioDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate, WKUIDelegate, WKDownloadDelegate {
    var window: NSWindow!
    var webView: WKWebView!
    var server: Process?
    var logHandle: FileHandle?
    var attempts = 0
    let studioURL = URL(string: "http://127.0.0.1:3017/en")!
    var bundled: Bool { Bundle.main.url(forResource: "bootstrap", withExtension: "cjs") != nil }
    var projectURL: URL { bundled ? Bundle.main.resourceURL! : Bundle.main.bundleURL.deletingLastPathComponent().appendingPathComponent("cinqra") }

    func applicationDidFinishLaunching(_ notification: Notification) {
        if let iconURL = Bundle.main.url(forResource: "Cinqra", withExtension: "icns"), let icon = NSImage(contentsOf: iconURL) {
            NSApp.applicationIconImage = icon
        }
        NSApp.setActivationPolicy(.regular)
        let menu = NSMenu()
        let appMenu = NSMenuItem()
        let submenu = NSMenu()
        submenu.addItem(withTitle: "About CINQRA", action: #selector(showAbout), keyEquivalent: "")
        submenu.addItem(.separator())
        submenu.addItem(withTitle: "Quit CINQRA", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        appMenu.submenu = submenu
        menu.addItem(appMenu)
        let editItem = NSMenuItem()
        let editMenu = NSMenu(title: "Edit")
        for (title, action, key) in [("Undo", "undo:", "z"), ("Cut", "cut:", "x"), ("Copy", "copy:", "c"), ("Paste", "paste:", "v"), ("Select All", "selectAll:", "a")] {
            editMenu.addItem(withTitle: title, action: Selector(action), keyEquivalent: key)
        }
        editItem.submenu = editMenu
        menu.addItem(editItem)
        NSApp.mainMenu = menu
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1440, height: 940), styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
        window.title = "CINQRA — AI Creative Studio"
        window.minSize = NSSize(width: 760, height: 600)
        window.backgroundColor = NSColor(calibratedRed: 0.05, green: 0.05, blue: 0.065, alpha: 1)
        let config = WKWebViewConfiguration()
        webView = WKWebView(frame: window.contentView!.bounds, configuration: config)
        webView.autoresizingMask = [.width, .height]
        webView.navigationDelegate = self
        webView.uiDelegate = self
        window.contentView = webView
        window.center()
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        webView.loadHTMLString("<html style='background:#101014;color:#d8c1ef;font:20px system-ui'><body style='display:grid;place-content:center;height:90vh;text-align:center'><h1 style='letter-spacing:10px'>CINQRA</h1><p style='font-size:12px;letter-spacing:3px'>CINEMA, REIMAGINED.</p><p style='font-size:11px;color:#92829f'>Opening your creative studio…</p></body></html>", baseURL: nil)
        checkServer(startIfMissing: true)
    }

    func checkServer(startIfMissing: Bool) {
        var request = URLRequest(url: studioURL)
        request.timeoutInterval = 2
        URLSession.shared.dataTask(with: request) { data, response, _ in
            let isStudio = (response as? HTTPURLResponse)?.statusCode == 200 && String(data: data ?? Data(), encoding: .utf8)?.contains("CINQRA") == true
            DispatchQueue.main.async {
                if isStudio { self.webView.load(URLRequest(url: self.studioURL)); return }
                if startIfMissing { self.startServer(); return }
                self.attempts += 1
                if self.attempts > 40 { self.fail("The local studio did not start. Check .cinqra-desktop.log in the cinqra folder."); return }
                DispatchQueue.main.asyncAfter(deadline: .now() + 1) { self.checkServer(startIfMissing: false) }
            }
        }.resume()
    }

    func startServer() {
        let next = projectURL.appendingPathComponent(bundled ? "bootstrap.cjs" : "node_modules/next/dist/bin/next")
        let node = bundled ? projectURL.appendingPathComponent("node").path : "/usr/local/bin/node"
        guard FileManager.default.isExecutableFile(atPath: node), FileManager.default.fileExists(atPath: next.path) else {
            fail("Keep CINQRA.app beside the cinqra folder with its installed dependencies. This local build uses /usr/local/bin/node.")
            return
        }
        do {
            let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("CINQRA")
            try FileManager.default.createDirectory(at: support, withIntermediateDirectories: true)
            let log = (bundled ? support : projectURL).appendingPathComponent(".cinqra-desktop.log")
            if !FileManager.default.fileExists(atPath: log.path) { FileManager.default.createFile(atPath: log.path, contents: nil, attributes: [.posixPermissions: 0o600]) }
            logHandle = try FileHandle(forWritingTo: log)
            try logHandle?.truncate(atOffset: 0)
            let process = Process()
            process.executableURL = URL(fileURLWithPath: node)
            process.arguments = bundled ? [next.path] : [next.path, "dev", "--hostname", "127.0.0.1", "--port", "3017"]
            process.currentDirectoryURL = projectURL
            process.standardOutput = logHandle
            process.standardError = logHandle
            process.standardInput = FileHandle.nullDevice
            process.environment = ProcessInfo.processInfo.environment.merging(["PATH": "/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"]) { _, value in value }
            server = process
            try process.run()
            DispatchQueue.main.asyncAfter(deadline: .now() + 1) { self.checkServer(startIfMissing: false) }
        } catch { fail("Could not start the local studio: \(error.localizedDescription)") }
    }
    func fail(_ message: String) { let alert = NSAlert(); alert.messageText = "CINQRA could not open"; alert.informativeText = message; alert.runModal() }
    @objc func showAbout() { NSApp.orderFrontStandardAboutPanel(options: [.applicationName: "CINQRA", .applicationVersion: "0.1.0", .credits: NSAttributedString(string: "AI Creative Studio\nCinema, Reimagined.\nIndependent local creative tools.")]) }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
    func applicationWillTerminate(_ notification: Notification) { if server?.isRunning == true { server?.terminate() }; try? logHandle?.close() }
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? { if let url = navigationAction.request.url { NSWorkspace.shared.open(url) }; return nil }
    func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping ([URL]?) -> Void) { let panel = NSOpenPanel(); panel.allowsMultipleSelection = parameters.allowsMultipleSelection; panel.canChooseDirectories = false; panel.beginSheetModal(for: window) { result in completionHandler(result == .OK ? panel.urls : nil) } }
    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) { let alert = NSAlert(); alert.messageText = message; alert.addButton(withTitle: "Confirm"); alert.addButton(withTitle: "Cancel"); alert.beginSheetModal(for: window) { result in completionHandler(result == .alertFirstButtonReturn) } }
    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) { let alert = NSAlert(); alert.messageText = message; alert.beginSheetModal(for: window) { _ in completionHandler() } }
    func webView(_ webView: WKWebView, decidePolicyFor navigationResponse: WKNavigationResponse, decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) { decisionHandler(navigationResponse.canShowMIMEType ? .allow : .download) }
    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) { download.delegate = self }
    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) { download.delegate = self }
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if navigationAction.shouldPerformDownload { decisionHandler(.download); return }
        if let url = navigationAction.request.url, let host = url.host, !["127.0.0.1", "localhost"].contains(host), navigationAction.targetFrame?.isMainFrame == true { NSWorkspace.shared.open(url); decisionHandler(.cancel); return }
        decisionHandler(.allow)
    }
    func download(_ download: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String, completionHandler: @escaping (URL?) -> Void) { let panel = NSSavePanel(); panel.nameFieldStringValue = suggestedFilename; panel.beginSheetModal(for: window) { result in completionHandler(result == .OK ? panel.url : nil) } }
}
@main
struct CinqraMain {
    @MainActor static func main() {
        let app = NSApplication.shared
        let delegate = StudioDelegate()
        app.delegate = delegate
        withExtendedLifetime(delegate) { app.run() }
    }
}
