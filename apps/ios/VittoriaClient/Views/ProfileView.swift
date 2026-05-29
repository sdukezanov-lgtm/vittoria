import SwiftUI

// MARK: - ViewModel

@MainActor
final class ProfileViewModel: ObservableObject {

    @Published var phone: String = ""
    @Published var firstName: String = ""
    @Published var lastName: String = ""
    @Published var isLoading: Bool = false
    @Published var isSaving: Bool = false
    @Published var errorMessage: String?
    @Published var savedConfirmation: Bool = false

    private let service: APIService

    init(service: APIService) {
        self.service = service
    }

    func load() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            let user = try await service.me()
            phone = user.phone ?? "—"
            firstName = user.firstName ?? ""
            lastName = user.lastName ?? ""
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func save() async {
        isSaving = true
        errorMessage = nil
        savedConfirmation = false
        defer { isSaving = false }
        do {
            let user = try await service.updateMe(
                firstName: firstName.isEmpty ? nil : firstName,
                lastName: lastName.isEmpty ? nil : lastName
            )
            firstName = user.firstName ?? ""
            lastName = user.lastName ?? ""
            savedConfirmation = true
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// Deletes the account, then logs out (which clears tokens + flips state).
    func deleteAccount(authStore: AuthStore) async {
        isSaving = true
        errorMessage = nil
        defer { isSaving = false }
        do {
            try await service.deleteAccount()
            await authStore.logout()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func logout(authStore: AuthStore) async {
        await authStore.logout()
    }
}

// MARK: - View

struct ProfileView: View {
    @EnvironmentObject var authStore: AuthStore

    @StateObject private var viewModel: ProfileViewModel
    @State private var showDeleteAlert = false

    init(service: APIService) {
        _viewModel = StateObject(wrappedValue: ProfileViewModel(service: service))
    }

    var body: some View {
        Form {
            if viewModel.isLoading {
                HStack {
                    Spacer()
                    ProgressView()
                    Spacer()
                }
            } else {
                Section("Телефон") {
                    Text(viewModel.phone)
                        .foregroundColor(.secondary)
                }

                Section("Имя") {
                    TextField("Имя", text: $viewModel.firstName)
                        .textContentType(.givenName)
                    TextField("Фамилия", text: $viewModel.lastName)
                        .textContentType(.familyName)

                    Button {
                        Task { await viewModel.save() }
                    } label: {
                        HStack {
                            Text("Сохранить")
                            if viewModel.isSaving {
                                Spacer()
                                ProgressView()
                            }
                        }
                    }
                    .disabled(viewModel.isSaving)

                    if viewModel.savedConfirmation {
                        Text("Сохранено")
                            .font(.footnote)
                            .foregroundColor(.green)
                    }
                }

                if let error = viewModel.errorMessage {
                    Section {
                        Text(error)
                            .foregroundColor(.red)
                            .font(.footnote)
                    }
                }

                Section {
                    Button("Выход") {
                        Task { await viewModel.logout(authStore: authStore) }
                    }
                    Button("Удалить аккаунт", role: .destructive) {
                        showDeleteAlert = true
                    }
                }
            }
        }
        .navigationTitle("Профиль")
        .navigationBarTitleDisplayMode(.inline)
        .task { await viewModel.load() }
        .alert("Удалить аккаунт?", isPresented: $showDeleteAlert) {
            Button("Отмена", role: .cancel) {}
            Button("Удалить", role: .destructive) {
                Task { await viewModel.deleteAccount(authStore: authStore) }
            }
        } message: {
            Text("Это действие необратимо. Все данные будут удалены.")
        }
    }
}
