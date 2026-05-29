import SwiftUI

// MARK: - ViewModel

@MainActor
final class ChatViewModel: ObservableObject {

    /// Displayed oldest-first (the API returns newest-first; we reverse for display).
    @Published var messages: [Message] = []
    @Published var draft: String = ""
    @Published var isLoading: Bool = false
    @Published var isSending: Bool = false
    @Published var errorMessage: String?

    private let service: APIService
    private let chatId: String

    init(service: APIService, chatId: String) {
        self.service = service
        self.chatId = chatId
    }

    func load() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            let response = try await service.messages(chatId: chatId, before: nil)
            // API returns newest-first; reverse so the oldest message is on top.
            messages = response.rows.reversed()
            await markReadIfNeeded()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func send() async {
        let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        isSending = true
        errorMessage = nil
        defer { isSending = false }
        do {
            _ = try await service.sendMessage(chatId: chatId, text: text)
            draft = ""
            // Reload to pick up the persisted message (and any others).
            let response = try await service.messages(chatId: chatId, before: nil)
            messages = response.rows.reversed()
            await markReadIfNeeded()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// Marks the chat read up to the newest message (the last one displayed).
    private func markReadIfNeeded() async {
        guard let newest = messages.last else { return }
        try? await service.markRead(chatId: chatId, upTo: newest.id)
    }
}

// MARK: - View

struct ChatView: View {
    @StateObject private var viewModel: ChatViewModel

    init(service: APIService, chatId: String) {
        _viewModel = StateObject(wrappedValue: ChatViewModel(service: service, chatId: chatId))
    }

    var body: some View {
        VStack(spacing: 0) {
            messagesList
            if let error = viewModel.errorMessage {
                Text(error)
                    .foregroundColor(.red)
                    .font(.footnote)
                    .padding(.horizontal)
            }
            composer
        }
        .navigationTitle("Чат с сервисом")
        .navigationBarTitleDisplayMode(.inline)
        .task { await viewModel.load() }
    }

    @ViewBuilder
    private var messagesList: some View {
        if viewModel.isLoading && viewModel.messages.isEmpty {
            Spacer()
            ProgressView()
            Spacer()
        } else if viewModel.messages.isEmpty {
            Spacer()
            Text("Сообщений пока нет")
                .foregroundColor(.secondary)
            Spacer()
        } else {
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(spacing: 8) {
                        ForEach(viewModel.messages, id: \.id) { message in
                            MessageBubble(message: message)
                                .id(message.id)
                        }
                    }
                    .padding()
                }
                .onChange(of: viewModel.messages.count) { _ in
                    if let lastId = viewModel.messages.last?.id {
                        withAnimation {
                            proxy.scrollTo(lastId, anchor: .bottom)
                        }
                    }
                }
                .onAppear {
                    if let lastId = viewModel.messages.last?.id {
                        proxy.scrollTo(lastId, anchor: .bottom)
                    }
                }
            }
        }
    }

    private var composer: some View {
        HStack(spacing: 8) {
            TextField("Сообщение…", text: $viewModel.draft, axis: .vertical)
                .textFieldStyle(.roundedBorder)
                .lineLimit(1...4)

            Button {
                Task { await viewModel.send() }
            } label: {
                Image(systemName: "arrow.up.circle.fill")
                    .font(.title2)
            }
            .disabled(viewModel.isSending || viewModel.draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        }
        .padding()
    }
}

// MARK: - Message bubble

private struct MessageBubble: View {
    let message: Message

    /// Client (current user) messages are trailing + blue; everyone else
    /// (admin/service) is leading + grey.
    private var isFromClient: Bool {
        message.senderRole.lowercased() == "client"
    }

    var body: some View {
        HStack {
            if isFromClient { Spacer(minLength: 40) }

            VStack(alignment: isFromClient ? .trailing : .leading, spacing: 4) {
                Text(message.text ?? "")
                    .foregroundColor(isFromClient ? .white : .primary)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(
                        RoundedRectangle(cornerRadius: 16)
                            .fill(isFromClient ? Color.blue : Color(.systemGray5))
                    )
                Text(message.createdAt)
                    .font(.caption2)
                    .foregroundColor(.secondary)
            }

            if !isFromClient { Spacer(minLength: 40) }
        }
    }
}
