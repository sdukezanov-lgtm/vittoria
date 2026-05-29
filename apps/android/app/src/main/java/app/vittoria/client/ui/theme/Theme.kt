package app.vittoria.client.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val VittoriaPrimary = Color(0xFF1565C0)       // blue 800
private val VittoriaOnPrimary = Color(0xFFFFFFFF)
private val VittoriaSecondary = Color(0xFF42A5F5)     // blue 400
private val VittoriaBackground = Color(0xFFF5F5F5)
private val VittoriaSurface = Color(0xFFFFFFFF)
private val VittoriaError = Color(0xFFB00020)

private val LightColorScheme = lightColorScheme(
    primary = VittoriaPrimary,
    onPrimary = VittoriaOnPrimary,
    secondary = VittoriaSecondary,
    background = VittoriaBackground,
    surface = VittoriaSurface,
    error = VittoriaError,
)

@Composable
fun VittoriaTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = LightColorScheme,
        content = content,
    )
}
