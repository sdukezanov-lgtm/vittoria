package app.vittoria.client.data.dto

import kotlinx.serialization.Serializable

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

@Serializable
data class RequestCodeResponse(
    val retry_after_sec: Int
)

@Serializable
data class VerifyCodeResponse(
    val access_token: String,
    val refresh_token: String,
    val user: UserDto
)

@Serializable
data class RefreshResponse(
    val access_token: String,
    val refresh_token: String
)

// ---------------------------------------------------------------------------
// User
// ---------------------------------------------------------------------------

@Serializable
data class UserDto(
    val id: String,
    val phone: String? = null,
    val role: String,
    val first_name: String? = null,
    val last_name: String? = null,
    val consent_accepted_at: String? = null
)

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

@Serializable
data class OrderDto(
    val id: String,
    val amocrm_deal_id: Long,
    val contract_number: String? = null,
    val product_name: String? = null,
    val total_amount: String? = null,
    val prepayment_amount: String? = null,
    val balance_due: String? = null,
    val current_stage: String,
    val progress_percent: Int,
    val service_phone: String? = null,
    val last_admin_comment: String? = null,
    val partner_services: List<PartnerServiceDto> = emptyList(),
    val created_at: String,
    val updated_at: String
)

@Serializable
data class PartnerServiceDto(
    val type: String,
    val label: String? = null,
    val date: String? = null,
    val price: Double? = null
)

@Serializable
data class OrdersResponse(
    val items: List<OrderDto>
)

// ---------------------------------------------------------------------------
// Stage history
// ---------------------------------------------------------------------------

@Serializable
data class StageHistoryDto(
    val id: String,
    val stage: String,
    val progress_percent: Int,
    val comment: String? = null,
    val changed_at: String
)

@Serializable
data class StageHistoryResponse(
    val items: List<StageHistoryDto>
)

// ---------------------------------------------------------------------------
// Chat & messages
// ---------------------------------------------------------------------------

@Serializable
data class ChatDto(
    val id: String,
    val order_id: String,
    val created_at: String,
    val unread_count: Int
)

@Serializable
data class MessageDto(
    val id: String,
    val chat_id: String,
    val sender_user_id: String,
    val sender_role: String,
    val text: String? = null,
    val attachments: List<AttachmentDto> = emptyList(),
    val read_at: String? = null,
    val created_at: String
)

@Serializable
data class AttachmentDto(
    val object_key: String,
    val mime: String,
    val size: Long,
    val url: String? = null
)

@Serializable
data class MessagesResponse(
    val rows: List<MessageDto>
)

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Serializable
data class ServiceContactDto(
    val phone: String,
    val hours: String
)

// ---------------------------------------------------------------------------
// Request bodies
// ---------------------------------------------------------------------------

@Serializable
data class RequestCodeBody(
    val phone: String
)

@Serializable
data class VerifyCodeBody(
    val phone: String,
    val code: String
)

@Serializable
data class RefreshBody(
    val refresh_token: String
)

@Serializable
data class SendMessageBody(
    val text: String? = null,
    val attachment_ids: List<String>? = null
)
