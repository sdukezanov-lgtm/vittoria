package app.vittoria.client.data.repo

import app.vittoria.client.data.api.VittoriaApi
import app.vittoria.client.data.dto.ChatDto
import app.vittoria.client.data.dto.MessageDto
import app.vittoria.client.data.dto.MessagesResponse
import app.vittoria.client.data.dto.SendMessageBody

class ChatRepository(private val api: VittoriaApi) {

    suspend fun orderChat(orderId: String): ChatDto = api.orderChat(orderId)

    suspend fun messages(chatId: String, before: String? = null): MessagesResponse =
        api.messages(id = chatId, before = before)

    suspend fun send(chatId: String, text: String): MessageDto =
        api.sendMessage(id = chatId, b = SendMessageBody(text = text))

    suspend fun markRead(chatId: String, upTo: String) =
        api.markRead(id = chatId, b = mapOf("up_to" to upTo))
}
