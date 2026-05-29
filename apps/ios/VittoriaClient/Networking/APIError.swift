import Foundation

/// A structured error returned by the Vittoria API.
struct APIError: Error, LocalizedError {
    let status: Int
    let code: String?
    let message: String

    var errorDescription: String? { message }
}

// MARK: - Wire format helpers

/// Top-level error envelope from the API: `{ "error": { "code": "...", "message": "..." } }`
struct APIErrorEnvelope: Decodable {
    struct Body: Decodable {
        let code: String?
        let message: String
    }
    let error: Body
}
