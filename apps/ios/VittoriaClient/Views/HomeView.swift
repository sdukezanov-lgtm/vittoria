import SwiftUI

// MARK: - Navigation routes

/// Destinations reachable from `HomeView` inside the same `NavigationStack`.
enum HomeRoute: Hashable {
    case history(orderId: String)
    case chat(chatId: String)
    case profile
}

// MARK: - ViewModel

@MainActor
final class HomeViewModel: ObservableObject {

    @Published var orders: [Order] = []
    @Published var selectedOrderId: String?
    @Published var serviceContact: ServiceContact?
    @Published var isLoading: Bool = false
    @Published var errorMessage: String?

    /// True while a "Чат с сервисом" tap is resolving the chat ID.
    @Published var isOpeningChat: Bool = false

    private let service: APIService

    init(service: APIService) {
        self.service = service
    }

    var selectedOrder: Order? {
        guard let id = selectedOrderId else { return orders.first }
        return orders.first(where: { $0.id == id }) ?? orders.first
    }

    func load() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            async let ordersResponse = service.orders()
            async let contact = service.serviceContact()

            let response = try await ordersResponse
            orders = response.items
            if selectedOrderId == nil {
                selectedOrderId = response.items.first?.id
            }
            // Service contact failure should not block the orders display.
            serviceContact = try? await contact
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// Resolves (or creates) the chat for an order and returns its ID.
    func openChat(orderId: String) async -> String? {
        isOpeningChat = true
        errorMessage = nil
        defer { isOpeningChat = false }
        do {
            let chat = try await service.orderChat(orderId: orderId)
            return chat.id
        } catch {
            errorMessage = error.localizedDescription
            return nil
        }
    }
}

// MARK: - View

struct HomeView: View {
    let service: APIService

    @StateObject private var viewModel: HomeViewModel
    @State private var path: [HomeRoute] = []

    init(service: APIService) {
        self.service = service
        _viewModel = StateObject(wrappedValue: HomeViewModel(service: service))
    }

    var body: some View {
        content
            .navigationTitle("VITTORIA HOME")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button {
                        path.append(.profile)
                    } label: {
                        Image(systemName: "person.crop.circle")
                    }
                }
            }
            .navigationDestination(for: HomeRoute.self) { route in
                switch route {
                case .history(let orderId):
                    HistoryView(service: service, orderId: orderId)
                case .chat(let chatId):
                    ChatView(service: service, chatId: chatId)
                case .profile:
                    ProfileView(service: service)
                }
            }
            .task { await viewModel.load() }
    }

    @ViewBuilder
    private var content: some View {
        if viewModel.isLoading && viewModel.orders.isEmpty {
            ProgressView()
        } else if let error = viewModel.errorMessage, viewModel.orders.isEmpty {
            VStack(spacing: 12) {
                Text(error)
                    .foregroundColor(.red)
                    .multilineTextAlignment(.center)
                Button("Повторить") {
                    Task { await viewModel.load() }
                }
            }
            .padding()
        } else if viewModel.orders.isEmpty {
            Text("Заказов нет")
                .foregroundColor(.secondary)
        } else {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    if viewModel.orders.count > 1 {
                        orderPicker
                    }
                    if let order = viewModel.selectedOrder {
                        OrderCardView(
                            order: order,
                            serviceContact: viewModel.serviceContact,
                            isOpeningChat: viewModel.isOpeningChat,
                            onHistory: { path.append(.history(orderId: order.id)) },
                            onChat: {
                                Task {
                                    if let chatId = await viewModel.openChat(orderId: order.id) {
                                        path.append(.chat(chatId: chatId))
                                    }
                                }
                            }
                        )
                    }
                    if let error = viewModel.errorMessage {
                        Text(error)
                            .foregroundColor(.red)
                            .font(.footnote)
                    }
                }
                .padding()
            }
        }
    }

    private var orderPicker: some View {
        Picker("Заказ", selection: Binding(
            get: { viewModel.selectedOrderId ?? viewModel.orders.first?.id ?? "" },
            set: { viewModel.selectedOrderId = $0 }
        )) {
            ForEach(viewModel.orders, id: \.id) { order in
                Text(order.contractNumber ?? order.productName ?? "Заказ").tag(order.id)
            }
        }
        .pickerStyle(.menu)
    }
}

// MARK: - Order card

struct OrderCardView: View {
    let order: Order
    let serviceContact: ServiceContact?
    let isOpeningChat: Bool
    let onHistory: () -> Void
    let onChat: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            // Header
            VStack(alignment: .leading, spacing: 4) {
                Text("Договор № \(order.contractNumber ?? "—")")
                    .font(.headline)
                Text(order.productName ?? "—")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
            }

            Divider()

            // Finances
            VStack(spacing: 8) {
                financeRow(label: "Стоимость", value: order.totalAmount)
                financeRow(label: "Предоплата", value: order.prepaymentAmount)
                financeRow(label: "Остаток", value: order.balanceDue)
            }

            Divider()

            // Stage + progress
            VStack(alignment: .leading, spacing: 8) {
                Text(stageLabel(order.currentStage))
                    .font(.subheadline.weight(.medium))
                ProgressView(value: Double(order.progressPercent) / 100.0)
                Text("\(order.progressPercent)%")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }

            // Admin comment
            if let comment = order.lastAdminComment, !comment.isEmpty {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Комментарий сервиса")
                        .font(.caption)
                        .foregroundColor(.secondary)
                    Text(comment)
                        .font(.subheadline)
                }
            }

            // Partner services
            if !order.partnerServices.isEmpty {
                Divider()
                VStack(alignment: .leading, spacing: 8) {
                    Text("Дополнительные услуги")
                        .font(.caption)
                        .foregroundColor(.secondary)
                    ForEach(Array(order.partnerServices.enumerated()), id: \.offset) { _, svc in
                        HStack {
                            Text(svc.label ?? svc.type)
                                .font(.subheadline)
                            Spacer()
                            if let date = svc.date {
                                Text(date)
                                    .font(.caption)
                                    .foregroundColor(.secondary)
                            }
                            if let price = svc.price {
                                Text(formattedPrice(price))
                                    .font(.subheadline)
                            }
                        }
                    }
                }
            }

            Divider()

            // Actions
            Button(action: onHistory) {
                HStack {
                    Image(systemName: "clock.arrow.circlepath")
                    Text("История этапов")
                    Spacer()
                    Image(systemName: "chevron.right")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }

            Button(action: onChat) {
                HStack {
                    Image(systemName: "bubble.left.and.bubble.right")
                    Text("Чат с сервисом")
                    Spacer()
                    if isOpeningChat {
                        ProgressView()
                    }
                }
            }
            .disabled(isOpeningChat)

            // Service phone
            if let contact = serviceContact {
                Divider()
                HStack {
                    Image(systemName: "phone")
                    if let url = URL(string: "tel:\(contact.phone.filter { $0.isNumber || $0 == "+" })") {
                        Link(contact.phone, destination: url)
                    } else {
                        Text(contact.phone)
                    }
                    Spacer()
                    Text(contact.hours)
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            } else if let phone = order.servicePhone {
                Divider()
                HStack {
                    Image(systemName: "phone")
                    if let url = URL(string: "tel:\(phone.filter { $0.isNumber || $0 == "+" })") {
                        Link(phone, destination: url)
                    } else {
                        Text(phone)
                    }
                }
            }
        }
        .padding()
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(Color(.secondarySystemBackground))
        )
    }

    private func financeRow(label: String, value: String?) -> some View {
        HStack {
            Text(label)
                .foregroundColor(.secondary)
            Spacer()
            Text(value ?? "—")
                .fontWeight(.medium)
        }
        .font(.subheadline)
    }

    private func formattedPrice(_ price: Double) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .decimal
        formatter.maximumFractionDigits = 2
        return formatter.string(from: NSNumber(value: price)) ?? "\(price)"
    }
}
