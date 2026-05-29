package app.vittoria.client.data.repo

import app.vittoria.client.data.api.VittoriaApi
import app.vittoria.client.data.dto.OrderDto
import app.vittoria.client.data.dto.OrdersResponse
import app.vittoria.client.data.dto.StageHistoryResponse

class OrdersRepository(private val api: VittoriaApi) {

    suspend fun orders(): OrdersResponse = api.orders()

    suspend fun order(id: String): OrderDto = api.order(id)

    suspend fun history(id: String): StageHistoryResponse = api.history(id)
}
