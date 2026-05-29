import Foundation

// MARK: - APIClient

/// Async/await HTTP client for the Vittoria REST API.
///
/// Refresh single-flight: a single `Task<Void, Error>` is stored as
/// `refreshTask`. Any concurrent call that hits 401 awaits that task instead of
/// starting a second refresh, preventing duplicate /auth/refresh requests.
actor APIClient {

    // MARK: Configuration

    static let defaultBaseURL = URL(string: "http://localhost:3000/api/v1")!

    private let baseURL: URL
    private let session: URLSession
    private let tokenStore: TokenStore

    private let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.keyDecodingStrategy = .convertFromSnakeCase
        return d
    }()

    private let encoder: JSONEncoder = {
        let e = JSONEncoder()
        e.keyEncodingStrategy = .convertToSnakeCase
        return e
    }()

    // MARK: Refresh single-flight

    /// Shared in-flight refresh task. Guarded by the actor's serial executor.
    private var refreshTask: Task<Void, Error>?

    // MARK: Init

    init(baseURL: URL = defaultBaseURL, tokenStore: TokenStore, session: URLSession = .shared) {
        self.baseURL = baseURL
        self.tokenStore = tokenStore
        self.session = session
    }

    // MARK: - Public interface

    /// Sends a request and decodes the JSON response body into `T`.
    func send<T: Decodable>(
        _ path: String,
        method: String = "GET",
        body: (any Encodable)? = nil,
        authorized: Bool = true
    ) async throws -> T {
        let request = try await buildRequest(path: path, method: method, body: body, authorized: authorized)
        let (data, response) = try await session.data(for: request)
        let http = response as! HTTPURLResponse

        if http.statusCode == 401 && authorized && !isAuthPath(path) {
            try await performRefresh()
            // Retry once with the new access token
            let retried = try await buildRequest(path: path, method: method, body: body, authorized: true)
            let (retryData, retryResponse) = try await session.data(for: retried)
            let retryHttp = retryResponse as! HTTPURLResponse
            return try decode(data: retryData, statusCode: retryHttp.statusCode)
        }

        return try decode(data: data, statusCode: http.statusCode)
    }

    /// Sends a request and discards the response body (for 204 No Content endpoints).
    func sendNoContent(
        _ path: String,
        method: String = "POST",
        body: (any Encodable)? = nil,
        authorized: Bool = true
    ) async throws {
        let request = try await buildRequest(path: path, method: method, body: body, authorized: authorized)
        let (data, response) = try await session.data(for: request)
        let http = response as! HTTPURLResponse

        if http.statusCode == 401 && authorized && !isAuthPath(path) {
            try await performRefresh()
            let retried = try await buildRequest(path: path, method: method, body: body, authorized: true)
            let (retryData, retryResponse) = try await session.data(for: retried)
            let retryHttp = retryResponse as! HTTPURLResponse
            guard (200..<300).contains(retryHttp.statusCode) || retryHttp.statusCode == 204 else {
                throw try decodeError(data: retryData, statusCode: retryHttp.statusCode)
            }
            return
        }

        guard (200..<300).contains(http.statusCode) || http.statusCode == 204 else {
            throw try decodeError(data: data, statusCode: http.statusCode)
        }
    }

    // MARK: - Refresh

    /// Ensures only one refresh is in-flight at a time (actor-serialised).
    private func performRefresh() async throws {
        if let existing = refreshTask {
            // Another caller is already refreshing — piggyback on it.
            try await existing.value
            return
        }

        let task = Task<Void, Error> { [weak self] in
            guard let self else { return }
            guard let refreshToken = await self.tokenStore.refreshToken else {
                await self.clearAndNotify()
                throw APIError(status: 401, code: "no_refresh_token", message: "No refresh token stored")
            }

            struct RefreshBody: Encodable { let refreshToken: String }
            let reqBody = RefreshBody(refreshToken: refreshToken)

            do {
                let request = try await self.buildRequest(
                    path: "/auth/refresh",
                    method: "POST",
                    body: reqBody,
                    authorized: false
                )
                let (data, response) = try await self.session.data(for: request)
                let http = response as! HTTPURLResponse
                let result: RefreshResponse = try self.decode(data: data, statusCode: http.statusCode)
                await self.tokenStore.setTokens(access: result.accessToken, refresh: result.refreshToken)
            } catch {
                await self.clearAndNotify()
                throw error
            }
        }

        refreshTask = task
        defer { refreshTask = nil }

        try await task.value
    }

    private func clearAndNotify() async {
        await tokenStore.clear()
        await MainActor.run {
            NotificationCenter.default.post(name: .vittoriaAuthFailed, object: nil)
        }
    }

    // MARK: - Helpers

    private func buildRequest(
        path: String,
        method: String,
        body: (any Encodable)?,
        authorized: Bool
    ) async throws -> URLRequest {
        // Build the full URL by string concatenation so that:
        //  1. Query strings in `path` are preserved (appendingPathComponent percent-encodes '?').
        //  2. The base path (/api/v1) is always kept (relative URL resolution would drop it
        //     when `path` starts with '/').
        let rawURL = baseURL.absoluteString.hasSuffix("/")
            ? baseURL.absoluteString + String(path.dropFirst(path.hasPrefix("/") ? 1 : 0))
            : baseURL.absoluteString + (path.hasPrefix("/") ? path : "/\(path)")
        guard let url = URL(string: rawURL) else {
            throw APIError(status: 0, code: "bad_path", message: "Invalid path: \(path)")
        }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")

        if authorized, let token = await tokenStore.accessToken {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        if let body {
            request.httpBody = try encoder.encode(body)
        }

        return request
    }

    private func decode<T: Decodable>(data: Data, statusCode: Int) throws -> T {
        guard (200..<300).contains(statusCode) else {
            throw try decodeError(data: data, statusCode: statusCode)
        }
        return try decoder.decode(T.self, from: data)
    }

    private func decodeError(data: Data, statusCode: Int) throws -> APIError {
        if let envelope = try? decoder.decode(APIErrorEnvelope.self, from: data) {
            return APIError(status: statusCode, code: envelope.error.code, message: envelope.error.message)
        }
        let fallback = String(data: data, encoding: .utf8) ?? "Unknown error"
        return APIError(status: statusCode, code: nil, message: fallback)
    }

    private func isAuthPath(_ path: String) -> Bool {
        path.hasPrefix("/auth")
    }
}

// MARK: - Notification name

extension Notification.Name {
    static let vittoriaAuthFailed = Notification.Name("vittoriaAuthFailed")
}
