package app.vittoria.client.data.repo

import app.vittoria.client.data.api.VittoriaApi
import app.vittoria.client.data.auth.TokenStore
import app.vittoria.client.data.dto.RequestCodeBody
import app.vittoria.client.data.dto.RequestCodeResponse
import app.vittoria.client.data.dto.UserDto
import app.vittoria.client.data.dto.VerifyCodeBody
import app.vittoria.client.data.dto.VerifyCodeResponse

class AuthRepository(
    private val api: VittoriaApi,
    private val tokenStore: TokenStore
) {

    suspend fun requestCode(phone: String): RequestCodeResponse =
        api.requestCode(RequestCodeBody(phone = phone))

    suspend fun verifyCode(phone: String, code: String): VerifyCodeResponse {
        val response = api.verifyCode(VerifyCodeBody(phone = phone, code = code))
        tokenStore.accessToken = response.access_token
        tokenStore.refreshToken = response.refresh_token
        return response
    }

    suspend fun logout() {
        try {
            api.logout()
        } finally {
            tokenStore.clear()
        }
    }

    suspend fun me(): UserDto = api.me()

    fun isLoggedIn(): Boolean = tokenStore.refreshToken != null
}
