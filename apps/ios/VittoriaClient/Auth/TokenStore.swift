import Foundation
import Security

// MARK: - TokenStore

/// Thread-safe persistent storage for JWT access and refresh tokens using the iOS Keychain.
///
/// Tokens are stored as `kSecClassGenericPassword` items under the service
/// `app.vittoria.client`, differentiated by `account` key.
actor TokenStore {

    // MARK: Constants

    private let service = "app.vittoria.client"
    private let accessAccount = "accessToken"
    private let refreshAccount = "refreshToken"

    // MARK: - Public interface

    var accessToken: String? {
        keychainGet(account: accessAccount)
    }

    var refreshToken: String? {
        keychainGet(account: refreshAccount)
    }

    func setTokens(access: String, refresh: String) {
        keychainSet(value: access, account: accessAccount)
        keychainSet(value: refresh, account: refreshAccount)
    }

    func clear() {
        keychainDelete(account: accessAccount)
        keychainDelete(account: refreshAccount)
    }

    // MARK: - Synchronous bootstrap helper

    /// Non-isolated synchronous check used only during `AuthStore.init` to
    /// determine login state without an async hop.  Safe because Keychain
    /// calls are internally thread-safe and no actor state is read/written.
    nonisolated static func hasStoredRefreshToken() -> Bool {
        let query: [CFString: Any] = [
            kSecClass: kSecClassGenericPassword,
            kSecAttrService: "app.vittoria.client",
            kSecAttrAccount: "refreshToken",
            kSecReturnData: false,
            kSecMatchLimit: kSecMatchLimitOne
        ]
        return SecItemCopyMatching(query as CFDictionary, nil) == errSecSuccess
    }

    // MARK: - Keychain helpers

    private func keychainGet(account: String) -> String? {
        let query: [CFString: Any] = [
            kSecClass: kSecClassGenericPassword,
            kSecAttrService: service,
            kSecAttrAccount: account,
            kSecReturnData: true,
            kSecMatchLimit: kSecMatchLimitOne
        ]
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status == errSecSuccess,
              let data = result as? Data,
              let string = String(data: data, encoding: .utf8) else {
            return nil
        }
        return string
    }

    private func keychainSet(value: String, account: String) {
        guard let data = value.data(using: .utf8) else { return }

        // Try updating an existing item first.
        let query: [CFString: Any] = [
            kSecClass: kSecClassGenericPassword,
            kSecAttrService: service,
            kSecAttrAccount: account
        ]
        let attributes: [CFString: Any] = [kSecValueData: data]
        let updateStatus = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)

        if updateStatus == errSecItemNotFound {
            // Item doesn't exist yet — add it.
            var addQuery = query
            addQuery[kSecValueData] = data
            SecItemAdd(addQuery as CFDictionary, nil)
        }
    }

    private func keychainDelete(account: String) {
        let query: [CFString: Any] = [
            kSecClass: kSecClassGenericPassword,
            kSecAttrService: service,
            kSecAttrAccount: account
        ]
        SecItemDelete(query as CFDictionary)
    }
}
