import Foundation

/// Dependency container that owns and wires together the core singletons.
///
/// Pass an instance into the SwiftUI environment via `.environmentObject(container)`.
final class AppContainer: ObservableObject {

    let tokenStore: TokenStore
    let api: APIClient
    let service: APIService

    init() {
        let tokenStore = TokenStore()
        let api = APIClient(tokenStore: tokenStore)
        let service = APIService(client: api)

        self.tokenStore = tokenStore
        self.api = api
        self.service = service
    }
}
