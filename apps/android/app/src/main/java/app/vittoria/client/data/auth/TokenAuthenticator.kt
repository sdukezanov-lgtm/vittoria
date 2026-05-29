package app.vittoria.client.data.auth

import app.vittoria.client.data.api.VittoriaApi
import app.vittoria.client.data.dto.RefreshBody
import okhttp3.Authenticator
import okhttp3.Request
import okhttp3.Response
import okhttp3.Route

/**
 * OkHttp [Authenticator] that handles 401 responses by attempting a token refresh.
 *
 * Uses a separate [refreshApi] Retrofit instance that has NO authenticator attached
 * (to avoid an infinite loop). Refresh calls are serialised with [@Synchronized].
 *
 * If the refresh succeeds: tokens are saved and the original request is retried with
 * the new access token.
 * If the refresh fails (network error, 401 on the refresh call, etc.): tokens are
 * cleared and null is returned, causing OkHttp to propagate the 401 to the caller.
 */
class TokenAuthenticator(
    private val refreshApi: VittoriaApi,
    private val tokenStore: TokenStore
) : Authenticator {

    @Synchronized
    override fun authenticate(route: Route?, response: Response): Request? {
        // If the request that just failed already carried the current access token
        // then another thread may have already refreshed. Re-read and retry once.
        val currentAccessToken = tokenStore.accessToken
        val requestToken = response.request.header("Authorization")
            ?.removePrefix("Bearer ")
            ?.trim()

        if (requestToken != null && requestToken != currentAccessToken && currentAccessToken != null) {
            // Another thread already refreshed — retry with the current token.
            return response.request.newBuilder()
                .header("Authorization", "Bearer $currentAccessToken")
                .build()
        }

        val refreshToken = tokenStore.refreshToken ?: run {
            tokenStore.clear()
            return null
        }

        return try {
            val refreshResponse = refreshApi
                .refreshSync(RefreshBody(refresh_token = refreshToken))
                .execute()

            if (refreshResponse.isSuccessful) {
                val body = refreshResponse.body() ?: run {
                    tokenStore.clear()
                    return null
                }
                tokenStore.accessToken = body.access_token
                tokenStore.refreshToken = body.refresh_token

                response.request.newBuilder()
                    .header("Authorization", "Bearer ${body.access_token}")
                    .build()
            } else {
                tokenStore.clear()
                null
            }
        } catch (e: Exception) {
            tokenStore.clear()
            null
        }
    }
}
