import SwiftUI

@main
struct VittoriaClientApp: App {
    // A single AppContainer instance shared with AuthStore.
    // We store it as a let-constant so the same object is injected into
    // both .environmentObject calls and used to create AuthStore.
    private let container: AppContainer
    @StateObject private var authStore: AuthStore

    init() {
        let c = AppContainer()
        container = c
        _authStore = StateObject(wrappedValue: AuthStore(container: c))
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(authStore)
                .environmentObject(container)
        }
    }
}
