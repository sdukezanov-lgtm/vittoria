package app.vittoria.client

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import app.vittoria.client.di.AppContainer
import app.vittoria.client.ui.VittoriaApp

/**
 * Single Activity entry point.
 *
 * The [AppContainer] is created lazily at the Application level (held in the companion
 * object) so it survives configuration changes. PART 2 may move this into an
 * Application subclass if needed.
 */
class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val container = AppHolder.getOrCreate(applicationContext)

        setContent {
            VittoriaApp(container = container)
        }
    }
}

/**
 * Simple process-scoped singleton holder for [AppContainer].
 * Avoids requiring a custom Application subclass for PART 1.
 */
object AppHolder {
    @Volatile
    private var instance: AppContainer? = null

    fun getOrCreate(context: android.content.Context): AppContainer =
        instance ?: synchronized(this) {
            instance ?: AppContainer(context.applicationContext).also { instance = it }
        }
}
