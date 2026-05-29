package app.vittoria.client.di

import android.content.Context
import app.vittoria.client.data.api.VittoriaApi
import app.vittoria.client.data.auth.AuthInterceptor
import app.vittoria.client.data.auth.TokenAuthenticator
import app.vittoria.client.data.auth.TokenStore
import app.vittoria.client.data.repo.AuthRepository
import app.vittoria.client.data.repo.ChatRepository
import app.vittoria.client.data.repo.OrdersRepository
import app.vittoria.client.data.repo.ProfileRepository
import com.jakewharton.retrofit2.converter.kotlinx.serialization.asConverterFactory
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import java.util.concurrent.TimeUnit

const val BASE_URL = "http://10.0.2.2:3000/api/v1/"

/**
 * Manual dependency injection container.
 *
 * Construction order is important to avoid circular dependencies:
 *
 *   1. [tokenStore]
 *   2. [json]
 *   3. [bareOkHttpClient] — no auth; used only for the refresh call
 *   4. [bareRetrofit] / [refreshApi] — no authenticator attached
 *   5. [tokenAuthenticator] — needs [refreshApi] + [tokenStore]
 *   6. [authInterceptor] — needs [tokenStore]
 *   7. [okHttpClient] — adds [authInterceptor] + [tokenAuthenticator]
 *   8. [retrofit] / [api] — full authenticated Retrofit
 *   9. Repositories
 */
class AppContainer(context: Context) {

    val json: Json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        // Property names match JSON snake_case exactly — no naming strategy needed.
    }

    val tokenStore: TokenStore = TokenStore(context)

    // -----------------------------------------------------------------------
    // "Bare" Retrofit — used ONLY for the refresh endpoint to avoid a loop.
    // No AuthInterceptor, no TokenAuthenticator.
    // -----------------------------------------------------------------------

    private val bareOkHttpClient: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .addInterceptor(
            HttpLoggingInterceptor().apply {
                level = HttpLoggingInterceptor.Level.BODY
            }
        )
        .build()

    private val jsonMediaType = "application/json".toMediaType()

    private val bareRetrofit: Retrofit = Retrofit.Builder()
        .baseUrl(BASE_URL)
        .client(bareOkHttpClient)
        .addConverterFactory(json.asConverterFactory(jsonMediaType))
        .build()

    val refreshApi: VittoriaApi = bareRetrofit.create(VittoriaApi::class.java)

    // -----------------------------------------------------------------------
    // Auth helpers — depend on refreshApi and tokenStore
    // -----------------------------------------------------------------------

    val tokenAuthenticator: TokenAuthenticator =
        TokenAuthenticator(refreshApi = refreshApi, tokenStore = tokenStore)

    val authInterceptor: AuthInterceptor = AuthInterceptor(tokenStore = tokenStore)

    // -----------------------------------------------------------------------
    // Full OkHttpClient — with auth interceptor + authenticator
    // -----------------------------------------------------------------------

    val okHttpClient: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .addInterceptor(authInterceptor)
        .addInterceptor(
            HttpLoggingInterceptor().apply {
                level = HttpLoggingInterceptor.Level.BODY
            }
        )
        .authenticator(tokenAuthenticator)
        .build()

    // -----------------------------------------------------------------------
    // Main Retrofit + API
    // -----------------------------------------------------------------------

    val retrofit: Retrofit = Retrofit.Builder()
        .baseUrl(BASE_URL)
        .client(okHttpClient)
        .addConverterFactory(json.asConverterFactory(jsonMediaType))
        .build()

    val api: VittoriaApi = retrofit.create(VittoriaApi::class.java)

    // -----------------------------------------------------------------------
    // Repositories
    // -----------------------------------------------------------------------

    val authRepository: AuthRepository = AuthRepository(api = api, tokenStore = tokenStore)

    val ordersRepository: OrdersRepository = OrdersRepository(api = api)

    val chatRepository: ChatRepository = ChatRepository(api = api)

    val profileRepository: ProfileRepository = ProfileRepository(api = api)
}
