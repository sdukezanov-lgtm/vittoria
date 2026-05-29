import SwiftUI

/// Top-level view that swaps between the authentication flow and the main
/// app depending on `AuthStore.isLoggedIn`.
struct RootView: View {
    @EnvironmentObject var authStore: AuthStore
    @EnvironmentObject var container: AppContainer

    var body: some View {
        Group {
            if authStore.isLoggedIn {
                MainTabOrStack(service: container.service)
            } else {
                AuthView(service: container.service)
            }
        }
        .task {
            // Validate any stored session at launch.
            await authStore.bootstrap()
        }
    }
}

/// The logged-in shell. `HomeView` owns its own `NavigationStack` (and the
/// `path` binding) so that pushes via `path.append(...)` actually drive the
/// stack.
struct MainTabOrStack: View {
    let service: APIService

    var body: some View {
        HomeView(service: service)
    }
}
