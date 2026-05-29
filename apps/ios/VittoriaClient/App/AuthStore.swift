import Foundation
import Combine

// MARK: - AuthStore

/// App-wide authentication state.  All mutations happen on the main actor so
/// SwiftUI can observe `isLoggedIn` directly without a `DispatchQueue.main` hop.
///
/// `isLoggedIn` is initialised synchronously from the Keychain (via the
/// non-isolated `TokenStore.hasStoredRefreshToken` sync helper) so SwiftUI
/// gets a real value on the very first render without any async overhead.
@MainActor
final class AuthStore: ObservableObject {

    @Published private(set) var isLoggedIn: Bool

    private let service: APIService
    private let tokenStore: TokenStore
    private var cancellables = Set<AnyCancellable>()

    init(container: AppContainer) {
        self.service = container.service
        self.tokenStore = container.tokenStore

        // TokenStore is an actor; we cannot call actor-isolated methods from a
        // synchronous init without risking a deadlock. Instead we check the
        // Keychain directly here using the public sync helper on TokenStore.
        self.isLoggedIn = TokenStore.hasStoredRefreshToken()

        // Watch for session invalidation triggered by APIClient (e.g. refresh failed).
        NotificationCenter.default
            .publisher(for: .vittoriaAuthFailed)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in
                self?.isLoggedIn = false
            }
            .store(in: &cancellables)
    }

    // MARK: - Actions

    /// Exchange an OTP code for tokens, save them, and update login state.
    func login(phone: String, code: String) async throws {
        let response = try await service.verifyCode(phone: phone, code: code)
        await tokenStore.setTokens(access: response.accessToken, refresh: response.refreshToken)
        isLoggedIn = true
    }

    /// Attempt a graceful server-side logout, then always clear local tokens.
    func logout() async {
        try? await service.logout()
        await tokenStore.clear()
        isLoggedIn = false
    }

    /// Called at app launch to verify the stored session is still usable.
    /// On failure the tokens are cleared and `isLoggedIn` becomes `false`.
    func bootstrap() async {
        guard isLoggedIn else { return }
        do {
            _ = try await service.me()
        } catch {
            await tokenStore.clear()
            isLoggedIn = false
        }
    }
}
