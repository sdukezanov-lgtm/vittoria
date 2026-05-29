package app.vittoria.client.ui.screens

import android.content.Intent
import android.net.Uri
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountCircle
import androidx.compose.material.icons.filled.Call
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import app.vittoria.client.common.stageLabel
import app.vittoria.client.data.dto.OrderDto
import app.vittoria.client.data.dto.ServiceContactDto
import app.vittoria.client.data.repo.ChatRepository
import app.vittoria.client.data.repo.OrdersRepository
import app.vittoria.client.data.repo.ProfileRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

// ---------------------------------------------------------------------------
// UiState
// ---------------------------------------------------------------------------

data class HomeUiState(
    val loading: Boolean = false,
    val error: String? = null,
    val orders: List<OrderDto> = emptyList(),
    val serviceContact: ServiceContactDto? = null,
    val chatNavigateTo: String? = null,   // chatId to navigate to
)

// ---------------------------------------------------------------------------
// ViewModel
// ---------------------------------------------------------------------------

class HomeViewModel(
    private val ordersRepository: OrdersRepository,
    private val chatRepository: ChatRepository,
    private val profileRepository: ProfileRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(HomeUiState())
    val uiState: StateFlow<HomeUiState> = _uiState

    init {
        load()
    }

    fun load() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(loading = true, error = null)
            try {
                val orders = ordersRepository.orders().items
                val contact = try { profileRepository.serviceContact() } catch (_: Exception) { null }
                _uiState.value = _uiState.value.copy(
                    loading = false,
                    orders = orders,
                    serviceContact = contact,
                )
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(
                    loading = false,
                    error = e.message ?: "Ошибка загрузки данных",
                )
            }
        }
    }

    fun openChat(orderId: String) {
        viewModelScope.launch {
            try {
                val chat = chatRepository.orderChat(orderId)
                _uiState.value = _uiState.value.copy(chatNavigateTo = chat.id)
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(
                    error = e.message ?: "Ошибка открытия чата"
                )
            }
        }
    }

    fun onChatNavigated() {
        _uiState.value = _uiState.value.copy(chatNavigateTo = null)
    }

    class Factory(
        private val ordersRepository: OrdersRepository,
        private val chatRepository: ChatRepository,
        private val profileRepository: ProfileRepository,
    ) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T =
            HomeViewModel(ordersRepository, chatRepository, profileRepository) as T
    }
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(
    ordersRepository: OrdersRepository,
    chatRepository: ChatRepository,
    profileRepository: ProfileRepository,
    navController: NavController,
    onOpenProfile: () -> Unit,
) {
    val vm: HomeViewModel = viewModel(
        factory = HomeViewModel.Factory(ordersRepository, chatRepository, profileRepository)
    )
    val state by vm.uiState.collectAsState()
    val context = LocalContext.current

    // Observe chat navigation trigger
    LaunchedEffect(state.chatNavigateTo) {
        val chatId = state.chatNavigateTo
        if (chatId != null) {
            navController.navigate("chat/$chatId")
            vm.onChatNavigated()
        }
    }

    var selectedIndex by remember { mutableStateOf(0) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("VITTORIA HOME") },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.primary,
                    titleContentColor = MaterialTheme.colorScheme.onPrimary,
                    actionIconContentColor = MaterialTheme.colorScheme.onPrimary,
                ),
                actions = {
                    IconButton(onClick = onOpenProfile) {
                        Icon(Icons.Filled.AccountCircle, contentDescription = "Профиль")
                    }
                }
            )
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
            state.error != null -> {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(paddingValues)
                        .padding(16.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(
                            text = state.error!!,
                            color = MaterialTheme.colorScheme.error,
                        )
                        Spacer(Modifier.height(16.dp))
                        Button(onClick = { vm.load() }) { Text("Повторить") }
                    }
                }
            }
            state.orders.isEmpty() -> {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(paddingValues),
                    contentAlignment = Alignment.Center,
                ) {
                    Text("Заказов нет", style = MaterialTheme.typography.bodyLarge)
                }
            }
            else -> {
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(paddingValues)
                        .verticalScroll(rememberScrollState())
                        .padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    // Order selector (only shown if >1 order)
                    if (state.orders.size > 1) {
                        Text("Ваши заказы:", style = MaterialTheme.typography.titleSmall)
                        state.orders.forEachIndexed { idx, order ->
                            val label = order.contract_number
                                ?: order.product_name
                                ?: "Заказ ${idx + 1}"
                            FilterChip(
                                selected = idx == selectedIndex,
                                onClick = { selectedIndex = idx },
                                label = { Text(label) },
                            )
                        }
                    }

                    val order = state.orders.getOrElse(selectedIndex) { state.orders.first() }
                    OrderCard(
                        order = order,
                        serviceContact = state.serviceContact,
                        onOpenChat = { vm.openChat(order.id) },
                        onOpenHistory = { navController.navigate("history/${order.id}") },
                        onCallService = { phone ->
                            val dialIntent = Intent(Intent.ACTION_DIAL, Uri.parse("tel:$phone"))
                            context.startActivity(dialIntent)
                        },
                    )
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// OrderCard
// ---------------------------------------------------------------------------

@Composable
private fun OrderCard(
    order: OrderDto,
    serviceContact: ServiceContactDto?,
    onOpenChat: () -> Unit,
    onOpenHistory: () -> Unit,
    onCallService: (String) -> Unit,
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            // Header
            Text(
                text = order.contract_number ?: "Договор: —",
                style = MaterialTheme.typography.titleMedium,
            )
            order.product_name?.let {
                Text(text = it, style = MaterialTheme.typography.bodyMedium)
            }

            HorizontalDivider()

            // Finances
            Text("Финансы", style = MaterialTheme.typography.titleSmall)
            FinancesRow(label = "Стоимость", value = order.total_amount)
            FinancesRow(label = "Предоплата", value = order.prepayment_amount)
            FinancesRow(label = "Остаток", value = order.balance_due)

            HorizontalDivider()

            // Stage + progress
            Text("Этап", style = MaterialTheme.typography.titleSmall)
            Text(
                text = stageLabel(order.current_stage),
                style = MaterialTheme.typography.bodyMedium,
            )
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                LinearProgressIndicator(
                    progress = { order.progress_percent / 100f },
                    modifier = Modifier.weight(1f),
                )
                Text(
                    text = "${order.progress_percent}%",
                    style = MaterialTheme.typography.bodySmall,
                )
            }

            // Admin comment
            if (order.last_admin_comment != null) {
                HorizontalDivider()
                Text("Комментарий менеджера", style = MaterialTheme.typography.titleSmall)
                Text(
                    text = order.last_admin_comment,
                    style = MaterialTheme.typography.bodyMedium,
                )
            }

            // Partner services
            if (order.partner_services.isNotEmpty()) {
                HorizontalDivider()
                Text("Дополнительные услуги", style = MaterialTheme.typography.titleSmall)
                order.partner_services.forEach { svc ->
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Text(
                            text = svc.label ?: svc.type,
                            style = MaterialTheme.typography.bodySmall,
                            modifier = Modifier.weight(1f),
                        )
                        Text(
                            text = buildString {
                                svc.date?.let { append(it) }
                                if (svc.date != null && svc.price != null) append("  ")
                                svc.price?.let { append("%.0f ₽".format(it)) }
                            },
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
                }
            }

            // Service contact
            if (serviceContact != null) {
                HorizontalDivider()
                Text("Сервис", style = MaterialTheme.typography.titleSmall)
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { onCallService(serviceContact.phone) }
                        .padding(vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Icon(
                        Icons.Filled.Call,
                        contentDescription = "Позвонить",
                        tint = MaterialTheme.colorScheme.primary,
                    )
                    Column {
                        Text(
                            text = serviceContact.phone,
                            color = MaterialTheme.colorScheme.primary,
                            style = MaterialTheme.typography.bodyMedium,
                        )
                        Text(
                            text = serviceContact.hours,
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
                }
            }

            HorizontalDivider()

            // Action buttons
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                OutlinedButton(
                    onClick = onOpenChat,
                    modifier = Modifier.weight(1f),
                ) {
                    Text("Чат с сервисом")
                }
                OutlinedButton(
                    onClick = onOpenHistory,
                    modifier = Modifier.weight(1f),
                ) {
                    Text("История этапов")
                }
            }
        }
    }
}

@Composable
private fun FinancesRow(label: String, value: String?) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(text = label, style = MaterialTheme.typography.bodySmall)
        Text(
            text = if (value != null) "$value ₽" else "—",
            style = MaterialTheme.typography.bodySmall,
        )
    }
}
