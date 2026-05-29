package app.vittoria.client.data.api

import app.vittoria.client.data.dto.AttachmentDto
import app.vittoria.client.data.dto.ChatDto
import app.vittoria.client.data.dto.MessageDto
import app.vittoria.client.data.dto.MessagesResponse
import app.vittoria.client.data.dto.OrderDto
import app.vittoria.client.data.dto.OrdersResponse
import app.vittoria.client.data.dto.RefreshBody
import app.vittoria.client.data.dto.RefreshResponse
import app.vittoria.client.data.dto.RequestCodeBody
import app.vittoria.client.data.dto.RequestCodeResponse
import app.vittoria.client.data.dto.SendMessageBody
import app.vittoria.client.data.dto.ServiceContactDto
import app.vittoria.client.data.dto.StageHistoryResponse
import app.vittoria.client.data.dto.UserDto
import app.vittoria.client.data.dto.VerifyCodeBody
import app.vittoria.client.data.dto.VerifyCodeResponse
import retrofit2.Call
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

interface VittoriaApi {

    // -----------------------------------------------------------------------
    // Auth
    // -----------------------------------------------------------------------

    @POST("auth/request-code")
    suspend fun requestCode(@Body b: RequestCodeBody): RequestCodeResponse

    @POST("auth/verify-code")
    suspend fun verifyCode(@Body b: VerifyCodeBody): VerifyCodeResponse

    /**
     * Synchronous Call variant used inside [app.vittoria.client.data.auth.TokenAuthenticator]
     * from a background OkHttp thread where suspending is not possible.
     */
    @POST("auth/refresh")
    fun refreshSync(@Body b: RefreshBody): Call<RefreshResponse>

    @POST("auth/logout")
    suspend fun logout()

    // -----------------------------------------------------------------------
    // Me (profile)
    // -----------------------------------------------------------------------

    @GET("me")
    suspend fun me(): UserDto

    @PATCH("me")
    suspend fun updateMe(@Body b: Map<String, String>): UserDto

    @POST("me/consent")
    suspend fun consent()

    @DELETE("me")
    suspend fun deleteMe()

    // -----------------------------------------------------------------------
    // Orders
    // -----------------------------------------------------------------------

    @GET("orders")
    suspend fun orders(): OrdersResponse

    @GET("orders/{id}")
    suspend fun order(@Path("id") id: String): OrderDto

    @GET("orders/{id}/history")
    suspend fun history(@Path("id") id: String): StageHistoryResponse

    // -----------------------------------------------------------------------
    // Chat
    // -----------------------------------------------------------------------

    @GET("orders/{id}/chat")
    suspend fun orderChat(@Path("id") id: String): ChatDto

    @GET("chats/{id}/messages")
    suspend fun messages(
        @Path("id") id: String,
        @Query("before") before: String? = null,
        @Query("limit") limit: Int = 50
    ): MessagesResponse

    @POST("chats/{id}/messages")
    suspend fun sendMessage(
        @Path("id") id: String,
        @Body b: SendMessageBody
    ): MessageDto

    @PATCH("chats/{id}/read")
    suspend fun markRead(
        @Path("id") id: String,
        @Body b: Map<String, String>
    )

    // -----------------------------------------------------------------------
    // Service
    // -----------------------------------------------------------------------

    @GET("service/contact")
    suspend fun serviceContact(): ServiceContactDto
}
