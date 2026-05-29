package app.vittoria.client.ui

import androidx.compose.runtime.*
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import app.vittoria.client.di.AppContainer
import app.vittoria.client.ui.screens.*
import app.vittoria.client.ui.theme.VittoriaTheme

/**
 * Root composable.
 *
 * Auth gate: on launch checks [AuthRepository.isLoggedIn]; if false shows [AuthScreen],
 * otherwise shows the main NavHost.
 *
 * Main routes:
 *   - home           (start destination)
 *   - history/{orderId}
 *   - chat/{chatId}
 *   - profile
 */
@Composable
fun VittoriaApp(container: AppContainer) {
    VittoriaTheme {
        var loggedIn by remember { mutableStateOf(container.authRepository.isLoggedIn()) }

        if (!loggedIn) {
            AuthScreen(
                authRepository = container.authRepository,
                profileRepository = container.profileRepository,
                onAuthenticated = { loggedIn = true },
            )
        } else {
            MainNavGraph(
                container = container,
                onLoggedOut = { loggedIn = false },
            )
        }
    }
}

@Composable
private fun MainNavGraph(
    container: AppContainer,
    onLoggedOut: () -> Unit,
) {
    val navController = rememberNavController()

    NavHost(
        navController = navController,
        startDestination = "home",
    ) {
        composable("home") {
            HomeScreen(
                ordersRepository = container.ordersRepository,
                chatRepository = container.chatRepository,
                profileRepository = container.profileRepository,
                navController = navController,
                onOpenProfile = { navController.navigate("profile") },
            )
        }

        composable(
            route = "history/{orderId}",
            arguments = listOf(navArgument("orderId") { type = NavType.StringType }),
        ) { backStackEntry ->
            val orderId = backStackEntry.arguments?.getString("orderId") ?: return@composable
            HistoryScreen(
                orderId = orderId,
                ordersRepository = container.ordersRepository,
                navController = navController,
            )
        }

        composable(
            route = "chat/{chatId}",
            arguments = listOf(navArgument("chatId") { type = NavType.StringType }),
        ) { backStackEntry ->
            val chatId = backStackEntry.arguments?.getString("chatId") ?: return@composable
            ChatScreen(
                chatId = chatId,
                chatRepository = container.chatRepository,
                navController = navController,
            )
        }

        composable("profile") {
            ProfileScreen(
                profileRepository = container.profileRepository,
                authRepository = container.authRepository,
                navController = navController,
                onLoggedOut = {
                    // Pop the whole back-stack to home before flipping the gate
                    navController.popBackStack("home", inclusive = true)
                    onLoggedOut()
                },
            )
        }
    }
}
