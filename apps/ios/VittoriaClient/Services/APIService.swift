import Foundation

// MARK: - Request body types

private struct PhoneBody: Encodable { let phone: String }
private struct VerifyBody: Encodable { let phone: String; let code: String }
private struct ProfileBody: Encodable { let firstName: String?; let lastName: String? }
private struct SendMessageBody: Encodable { let text: String }
private struct MarkReadBody: Encodable { let upTo: String }

// MARK: - APIService

/// High-level typed wrapper around `APIClient` that exposes one method per
/// Vittoria API endpoint.
final class APIService {

    private let client: APIClient

    init(client: APIClient) {
        self.client = client
    }

    // MARK: Auth

    /// Request a verification code to be sent to `phone`.
    @discardableResult
    func requestCode(phone: String) async throws -> RequestCodeResponse {
        try await client.send("/auth/request-code", method: "POST", body: PhoneBody(phone: phone), authorized: false)
    }

    /// Exchange phone + code for tokens and user profile.
    func verifyCode(phone: String, code: String) async throws -> VerifyCodeResponse {
        try await client.send("/auth/verify-code", method: "POST", body: VerifyBody(phone: phone, code: code), authorized: false)
    }

    /// Invalidate the current session server-side.
    func logout() async throws {
        try await client.sendNoContent("/auth/logout", method: "POST")
    }

    // MARK: Profile

    /// Fetch the current user's profile.
    func me() async throws -> UserDTO {
        try await client.send("/users/me")
    }

    /// Update display name fields.
    func updateMe(firstName: String?, lastName: String?) async throws -> UserDTO {
        try await client.send("/users/me", method: "PATCH", body: ProfileBody(firstName: firstName, lastName: lastName))
    }

    /// Accept terms of service / privacy consent.
    func consent() async throws {
        try await client.sendNoContent("/users/me/consent", method: "POST")
    }

    /// Request account deletion.
    func deleteAccount() async throws {
        try await client.sendNoContent("/users/me", method: "DELETE")
    }

    // MARK: Orders

    /// List all orders for the current user.
    func orders() async throws -> OrdersResponse {
        try await client.send("/orders")
    }

    /// Fetch a single order by its ID.
    func order(id: String) async throws -> Order {
        try await client.send("/orders/\(id)")
    }

    /// Fetch the stage history for an order.
    func history(id: String) async throws -> StageHistoryResponse {
        try await client.send("/orders/\(id)/history")
    }

    // MARK: Chat

    /// Get or create the chat room associated with an order.
    func orderChat(orderId: String) async throws -> Chat {
        try await client.send("/orders/\(orderId)/chat")
    }

    /// List messages in a chat, optionally before a cursor message ID.
    func messages(chatId: String, before: String? = nil) async throws -> MessagesResponse {
        var path = "/chats/\(chatId)/messages"
        if let before {
            path += "?before=\(before)"
        }
        return try await client.send(path)
    }

    /// Send a text message to a chat.
    func sendMessage(chatId: String, text: String) async throws -> Message {
        try await client.send("/chats/\(chatId)/messages", method: "POST", body: SendMessageBody(text: text))
    }

    /// Mark messages as read up to a given message ID.
    func markRead(chatId: String, upTo: String) async throws {
        try await client.sendNoContent("/chats/\(chatId)/read", method: "POST", body: MarkReadBody(upTo: upTo))
    }

    // MARK: Service info

    /// Fetch the company service contact (phone + hours).
    func serviceContact() async throws -> ServiceContact {
        try await client.send("/service-contact", authorized: false)
    }
}
