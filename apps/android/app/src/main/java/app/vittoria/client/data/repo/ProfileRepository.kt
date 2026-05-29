package app.vittoria.client.data.repo

import app.vittoria.client.data.api.VittoriaApi
import app.vittoria.client.data.dto.ServiceContactDto
import app.vittoria.client.data.dto.UserDto

class ProfileRepository(private val api: VittoriaApi) {

    suspend fun me(): UserDto = api.me()

    suspend fun updateMe(firstName: String, lastName: String): UserDto =
        api.updateMe(
            mapOf(
                "first_name" to firstName,
                "last_name" to lastName
            )
        )

    suspend fun consent() = api.consent()

    suspend fun deleteAccount() = api.deleteMe()

    suspend fun serviceContact(): ServiceContactDto = api.serviceContact()
}
