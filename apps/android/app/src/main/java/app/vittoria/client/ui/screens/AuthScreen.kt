package app.vittoria.client.ui.screens

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import app.vittoria.client.data.repo.AuthRepository
import app.vittoria.client.data.repo.ProfileRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

// ---------------------------------------------------------------------------
// UiState
// ---------------------------------------------------------------------------

data class AuthUiState(
    val loading: Boolean = false,
    val error: String? = null,
    val codeSent: Boolean = false,
    val authenticated: Boolean = false,
)

// ---------------------------------------------------------------------------
// ViewModel
// ---------------------------------------------------------------------------

class AuthViewModel(
    private val authRepository: AuthRepository,
    private val profileRepository: ProfileRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(AuthUiState())
    val uiState: StateFlow<AuthUiState> = _uiState

    fun requestCode(phone: String) {
        if (!phone.matches(Regex("^\\+7\\d{10}$"))) {
            _uiState.value = _uiState.value.copy(error = "Введите номер в формате +7XXXXXXXXXX")
            return
        }
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(loading = true, error = null)
            try {
                authRepository.requestCode(phone)
                _uiState.value = _uiState.value.copy(loading = false, codeSent = true)
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(
                    loading = false,
                    error = e.message ?: "Ошибка отправки кода"
                )
            }
        }
    }

    fun verifyCode(phone: String, code: String) {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(loading = true, error = null)
            try {
                authRepository.verifyCode(phone, code)
                // Silently post consent after first login
                try { profileRepository.consent() } catch (_: Exception) {}
                _uiState.value = _uiState.value.copy(loading = false, authenticated = true)
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(
                    loading = false,
                    error = e.message ?: "Неверный код"
                )
            }
        }
    }

    fun clearError() {
        _uiState.value = _uiState.value.copy(error = null)
    }

    class Factory(
        private val authRepository: AuthRepository,
        private val profileRepository: ProfileRepository,
    ) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T =
            AuthViewModel(authRepository, profileRepository) as T
    }
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AuthScreen(
    authRepository: AuthRepository,
    profileRepository: ProfileRepository,
    onAuthenticated: () -> Unit,
) {
    val vm: AuthViewModel = viewModel(
        factory = AuthViewModel.Factory(authRepository, profileRepository)
    )
    val state by vm.uiState.collectAsState()

    // Trigger navigation callback when authentication succeeded
    LaunchedEffect(state.authenticated) {
        if (state.authenticated) onAuthenticated()
    }

    var phone by remember { mutableStateOf("") }
    var code by remember { mutableStateOf("") }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("VITTORIA HOME") },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.primary,
                    titleContentColor = MaterialTheme.colorScheme.onPrimary,
                )
            )
        }
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .padding(horizontal = 24.dp, vertical = 32.dp),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                text = "Вход",
                style = MaterialTheme.typography.headlineMedium,
                modifier = Modifier.padding(bottom = 32.dp)
            )

            if (!state.codeSent) {
                // Step 1: phone input
                OutlinedTextField(
                    value = phone,
                    onValueChange = {
                        phone = it
                        vm.clearError()
                    },
                    label = { Text("Номер телефона") },
                    placeholder = { Text("+7XXXXXXXXXX") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(
                        keyboardType = KeyboardType.Phone,
                        imeAction = ImeAction.Done,
                    ),
                    keyboardActions = KeyboardActions(
                        onDone = { vm.requestCode(phone) }
                    ),
                    isError = state.error != null,
                    modifier = Modifier.fillMaxWidth(),
                )

                if (state.error != null) {
                    Text(
                        text = state.error!!,
                        color = MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.bodySmall,
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(top = 4.dp),
                    )
                }

                Spacer(Modifier.height(16.dp))

                Button(
                    onClick = { vm.requestCode(phone) },
                    enabled = !state.loading,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    if (state.loading) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(20.dp),
                            strokeWidth = 2.dp,
                            color = MaterialTheme.colorScheme.onPrimary,
                        )
                    } else {
                        Text("Получить код")
                    }
                }
            } else {
                // Step 2: code input
                Text(
                    text = "Код отправлен на $phone",
                    style = MaterialTheme.typography.bodyMedium,
                    modifier = Modifier.padding(bottom = 16.dp),
                )

                OutlinedTextField(
                    value = code,
                    onValueChange = {
                        if (it.length <= 4) {
                            code = it
                            vm.clearError()
                        }
                    },
                    label = { Text("Код из SMS") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(
                        keyboardType = KeyboardType.NumberPassword,
                        imeAction = ImeAction.Done,
                    ),
                    keyboardActions = KeyboardActions(
                        onDone = { vm.verifyCode(phone, code) }
                    ),
                    isError = state.error != null,
                    modifier = Modifier.fillMaxWidth(),
                )

                if (state.error != null) {
                    Text(
                        text = state.error!!,
                        color = MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.bodySmall,
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(top = 4.dp),
                    )
                }

                Spacer(Modifier.height(16.dp))

                Button(
                    onClick = { vm.verifyCode(phone, code) },
                    enabled = !state.loading,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    if (state.loading) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(20.dp),
                            strokeWidth = 2.dp,
                            color = MaterialTheme.colorScheme.onPrimary,
                        )
                    } else {
                        Text("Войти")
                    }
                }

                Spacer(Modifier.height(8.dp))

                TextButton(
                    onClick = {
                        code = ""
                        vm.clearError()
                    }
                ) {
                    Text("Изменить номер")
                }
            }
        }
    }
}
