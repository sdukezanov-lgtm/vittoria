import Foundation

// MARK: - Auth

struct UserDTO: Codable {
    let id: String
    let phone: String?
    let role: String
    let firstName: String?
    let lastName: String?
    let consentAcceptedAt: String?
}

struct VerifyCodeResponse: Codable {
    let accessToken: String
    let refreshToken: String
    let user: UserDTO
}

struct RefreshResponse: Codable {
    let accessToken: String
    let refreshToken: String
}

struct RequestCodeResponse: Codable {
    let retryAfterSec: Int
}

// MARK: - Orders

struct PartnerService: Codable {
    let type: String
    let label: String?
    let date: String?
    let price: Double?
}

struct Order: Codable {
    let id: String
    let amocrmDealId: Int
    let contractNumber: String?
    let productName: String?
    let totalAmount: String?
    let prepaymentAmount: String?
    let balanceDue: String?
    let currentStage: String
    let progressPercent: Int
    let servicePhone: String?
    let lastAdminComment: String?
    let partnerServices: [PartnerService]
    let createdAt: String
    let updatedAt: String

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        amocrmDealId = try c.decode(Int.self, forKey: .amocrmDealId)
        contractNumber = try c.decodeIfPresent(String.self, forKey: .contractNumber)
        productName = try c.decodeIfPresent(String.self, forKey: .productName)
        totalAmount = try c.decodeIfPresent(String.self, forKey: .totalAmount)
        prepaymentAmount = try c.decodeIfPresent(String.self, forKey: .prepaymentAmount)
        balanceDue = try c.decodeIfPresent(String.self, forKey: .balanceDue)
        currentStage = try c.decode(String.self, forKey: .currentStage)
        progressPercent = try c.decode(Int.self, forKey: .progressPercent)
        servicePhone = try c.decodeIfPresent(String.self, forKey: .servicePhone)
        lastAdminComment = try c.decodeIfPresent(String.self, forKey: .lastAdminComment)
        partnerServices = (try c.decodeIfPresent([PartnerService].self, forKey: .partnerServices)) ?? []
        createdAt = try c.decode(String.self, forKey: .createdAt)
        updatedAt = try c.decode(String.self, forKey: .updatedAt)
    }
}

struct OrdersResponse: Codable {
    let items: [Order]
}

// MARK: - Stage history

struct StageHistory: Codable {
    let id: String
    let stage: String
    let progressPercent: Int
    let comment: String?
    let changedAt: String
}

struct StageHistoryResponse: Codable {
    let items: [StageHistory]
}

// MARK: - Chat & messages

struct Chat: Codable {
    let id: String
    let orderId: String
    let createdAt: String
    let unreadCount: Int
}

struct Attachment: Codable {
    let objectKey: String
    let mime: String
    let size: Int
    let url: String?
}

struct Message: Codable {
    let id: String
    let chatId: String
    let senderUserId: String
    let senderRole: String
    let text: String?
    let attachments: [Attachment]
    let readAt: String?
    let createdAt: String

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        chatId = try c.decode(String.self, forKey: .chatId)
        senderUserId = try c.decode(String.self, forKey: .senderUserId)
        senderRole = try c.decode(String.self, forKey: .senderRole)
        text = try c.decodeIfPresent(String.self, forKey: .text)
        attachments = (try c.decodeIfPresent([Attachment].self, forKey: .attachments)) ?? []
        readAt = try c.decodeIfPresent(String.self, forKey: .readAt)
        createdAt = try c.decode(String.self, forKey: .createdAt)
    }
}

struct MessagesResponse: Codable {
    let rows: [Message]
}

// MARK: - Misc

struct ServiceContact: Codable {
    let phone: String
    let hours: String
}
