package app.vittoria.client.data.auth

import okhttp3.Interceptor
import okhttp3.Response

/**
 * Attaches the Bearer access token to every request that is NOT an auth endpoint.
 * Auth endpoints (request-code, verify-code, refresh) are passed through unchanged.
 */
class AuthInterceptor(private val tokenStore: TokenStore) : Interceptor {

    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        val path = request.url.encodedPath

        // Do not add Authorization to auth endpoints — they don't need it
        // and the refresh endpoint specifically must work without a valid access token.
        if (path.contains("/auth/")) {
            return chain.proceed(request)
        }

        val token = tokenStore.accessToken
        if (token.isNullOrBlank()) {
            return chain.proceed(request)
        }

        val authenticatedRequest = request.newBuilder()
            .header("Authorization", "Bearer $token")
            .build()

        return chain.proceed(authenticatedRequest)
    }
}
