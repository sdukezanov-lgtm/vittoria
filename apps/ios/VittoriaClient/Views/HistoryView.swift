import SwiftUI

// MARK: - ViewModel

@MainActor
final class HistoryViewModel: ObservableObject {

    @Published var items: [StageHistory] = []
    @Published var isLoading: Bool = false
    @Published var errorMessage: String?

    private let service: APIService
    private let orderId: String

    init(service: APIService, orderId: String) {
        self.service = service
        self.orderId = orderId
    }

    func load() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            let response = try await service.history(id: orderId)
            items = response.items
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

// MARK: - View

struct HistoryView: View {
    @StateObject private var viewModel: HistoryViewModel

    init(service: APIService, orderId: String) {
        _viewModel = StateObject(wrappedValue: HistoryViewModel(service: service, orderId: orderId))
    }

    var body: some View {
        content
            .navigationTitle("История этапов")
            .navigationBarTitleDisplayMode(.inline)
            .task { await viewModel.load() }
    }

    @ViewBuilder
    private var content: some View {
        if viewModel.isLoading && viewModel.items.isEmpty {
            ProgressView()
        } else if let error = viewModel.errorMessage, viewModel.items.isEmpty {
            VStack(spacing: 12) {
                Text(error)
                    .foregroundColor(.red)
                    .multilineTextAlignment(.center)
                Button("Повторить") {
                    Task { await viewModel.load() }
                }
            }
            .padding()
        } else if viewModel.items.isEmpty {
            Text("История пуста")
                .foregroundColor(.secondary)
        } else {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    ForEach(Array(viewModel.items.enumerated()), id: \.element.id) { index, item in
                        TimelineRow(
                            item: item,
                            isFirst: index == 0,
                            isLast: index == viewModel.items.count - 1
                        )
                    }
                }
                .padding()
            }
        }
    }
}

// MARK: - Timeline row

private struct TimelineRow: View {
    let item: StageHistory
    let isFirst: Bool
    let isLast: Bool

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            // Timeline rail
            VStack(spacing: 0) {
                Rectangle()
                    .fill(isFirst ? Color.clear : Color.secondary.opacity(0.3))
                    .frame(width: 2, height: 12)
                Circle()
                    .fill(Color.accentColor)
                    .frame(width: 12, height: 12)
                Rectangle()
                    .fill(isLast ? Color.clear : Color.secondary.opacity(0.3))
                    .frame(width: 2)
                    .frame(maxHeight: .infinity)
            }

            // Content
            VStack(alignment: .leading, spacing: 4) {
                Text(stageLabel(item.stage))
                    .font(.subheadline.weight(.medium))
                HStack(spacing: 8) {
                    Text("\(item.progressPercent)%")
                        .font(.caption)
                        .foregroundColor(.secondary)
                    Text(item.changedAt)
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
                if let comment = item.comment, !comment.isEmpty {
                    Text(comment)
                        .font(.footnote)
                }
            }
            .padding(.bottom, 16)

            Spacer(minLength: 0)
        }
    }
}
