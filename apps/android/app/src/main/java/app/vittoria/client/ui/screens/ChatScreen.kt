package app.vittoria.client.ui.screens

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import app.vittoria.client.data.dto.MessageDto
import app.vittoria.client.data.repo.ChatRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

// ---------------------------------------------------------------------------
// UiState
// ---------------------------------------------------------------------------

data class ChatUiState(
    val loading: Boolean = false,
    val error: String? = null,
    // Messages in display order: oldest first, newest last
    val messages: List<MessageDto> = emptyList(),
    val sending: Boolean = false,
    // The sender_user_id of the currently logged-in client (unknown until first message load)
    val clientUserId: String? = null,
)

// ---------------------------------------------------------------------------
// ViewModel
// ---------------------------------------------------------------------------

class ChatViewModel(
    private val chatRepository: ChatRepository,
    private val chatId: String,
) : ViewModel() {

    private val _uiState = MutableStateFlow(ChatUiState())
    val uiState: StateFlow<ChatUiState> = _uiState

    init {
        load()
    }

    fun load() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(loading = true, error = null)
            try {
                // API returns newest-first; reverse to display oldest→newest
                val rows = chatRepository.messages(chatId).rows.reversed()
                // Mark newest message as read
                if (rows.isNotEmpty()) {
                    val newestId = rows.last().id
                    try { chatRepository.markRead(chatId, newestId) } catch (_: Exception) {}
                }
                _uiState.value = _uiState.value.copy(loading = false, messages = rows)
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(
                    loading = false,
                    error = e.message ?: "Ошибка загрузки сообщений",
                )
            }
        }
    }

    fun send(text: String) {
        if (text.isBlank()) return
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(sending = true)
            try {
                chatRepository.send(chatId, text)
                // Reload to get the server-confirmed message
                val rows = chatRepository.messages(chatId).rows.reversed()
                _uiState.value = _uiState.value.copy(sending = false, messages = rows)
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(
                    sending = false,
                    error = e.message ?: "Ошибка отправки",
                )
            }
        }
    }

    fun clearError() {
        _uiState.value = _uiState.value.copy(error = null)
    }

    class Factory(
        private val chatRepository: ChatRepository,
        private val chatId: String,
    ) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T =
            ChatViewModel(chatRepository, chatId) as T
    }
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChatScreen(
    chatId: String,
    chatRepository: ChatRepository,
    navController: NavController,
) {
    val vm: ChatViewModel = viewModel(
        key = "chat_$chatId",
        factory = ChatViewModel.Factory(chatRepository, chatId),
    )
    val state by vm.uiState.collectAsState()
    var inputText by remember { mutableStateOf("") }
    val listState = rememberLazyListState()

    // Scroll to bottom whenever messages change
    LaunchedEffect(state.messages.size) {
        if (state.messages.isNotEmpty()) {
            listState.animateScrollToItem(state.messages.size - 1)
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Чат с сервисом") },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.primary,
                    titleContentColor = MaterialTheme.colorScheme.onPrimary,
                    navigationIconContentColor = MaterialTheme.colorScheme.onPrimary,
                ),
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(
                            Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = "Назад",
                        )
                    }
                }
            )
        },
        bottomBar = {
            Surface(tonalElevation = 4.dp) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(8.dp)
                        .navigationBarsPadding()
                        .imePadding(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    OutlinedTextField(
                        value = inputText,
                        onValueChange = { inputText = it },
                        placeholder = { Text("Сообщение…") },
                        modifier = Modifier.weight(1f),
                        maxLines = 4,
                        enabled = !state.sending,
                    )
                    IconButton(
                        onClick = {
                            val text = inputText.trim()
                            if (text.isNotEmpty()) {
                                inputText = ""
                                vm.send(text)
                            }
                        },
                        enabled = inputText.isNotBlank() && !state.sending,
                    ) {
                        Icon(
                            Icons.AutoMirrored.Filled.Send,
                            contentDescription = "Отправить",
                            tint = MaterialTheme.colorScheme.primary,
                        )
                    }
                }
            }
        }
    ) { paddingValues ->
        when {
            state.loading -> {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(paddingValues),
                    contentAlignment = Alignment.Center,
                ) {
                    CircularProgressIndicator()
                }
            }
            else -> {
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(paddingValues),
                ) {
                    if (state.error != null) {
                        Text(
                            text = state.error!!,
                            color = MaterialTheme.colorScheme.error,
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 16.dp, vertical = 4.dp),
                        )
                    }

                    LazyColumn(
                        state = listState,
                        modifier = Modifier
                            .weight(1f)
                            .fillMaxWidth(),
                        contentPadding = PaddingValues(12.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        items(state.messages) { msg ->
                            MessageBubble(msg = msg)
                        }
                    }
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Message bubble
// ---------------------------------------------------------------------------

@Composable
private fun MessageBubble(msg: MessageDto) {
    // Treat "client" role as sent by current user; "admin" or anything else is received
    val isClient = msg.sender_role == "client"

    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = if (isClient) Arrangement.End else Arrangement.Start,
    ) {
        Column(
            modifier = Modifier
                .widthIn(max = 280.dp)
                .background(
                    color = if (isClient) Color(0xFF1565C0) else Color(0xFFE0E0E0),
                    shape = RoundedCornerShape(
                        topStart = 12.dp,
                        topEnd = 12.dp,
                        bottomStart = if (isClient) 12.dp else 2.dp,
                        bottomEnd = if (isClient) 2.dp else 12.dp,
                    ),
                )
                .padding(horizontal = 12.dp, vertical = 8.dp),
        ) {
            if (!msg.text.isNullOrBlank()) {
                Text(
                    text = msg.text,
                    color = if (isClient) Color.White else Color.Black,
                    style = MaterialTheme.typography.bodyMedium,
                )
            }
            Text(
                text = msg.created_at.take(16).replace("T", " "),
                color = if (isClient) Color(0xCCFFFFFF) else Color(0x99000000),
                style = MaterialTheme.typography.labelSmall,
                modifier = Modifier.align(Alignment.End),
            )
        }
    }
}
