import SwiftUI

// MARK: - ViewModel

@MainActor
final class AuthViewModel: ObservableObject {

    enum Step {
        case phone
        case code
    }

    @Published var phone: String = ""
    @Published var code: String = ""
    @Published var step: Step = .phone
    @Published var isLoading: Bool = false
    @Published var errorMessage: String?

    private let service: APIService

    init(service: APIService) {
        self.service = service
    }

    private static let phoneRegex = #"^\+7\d{10}$"#

    var isPhoneValid: Bool {
        phone.range(of: Self.phoneRegex, options: .regularExpression) != nil
    }

    /// Step 1: validate the phone and request an OTP code.
    func requestCode() async {
        errorMessage = nil
        guard isPhoneValid else {
            errorMessage = "Введите номер в формате +7XXXXXXXXXX"
            return
        }
        isLoading = true
        defer { isLoading = false }
        do {
            try await service.requestCode(phone: phone)
            step = .code
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// Step 2: exchange phone + code for tokens. On success the `AuthStore`
    /// flips `isLoggedIn` and `RootView` swaps automatically.
    func login(authStore: AuthStore) async {
        errorMessage = nil
        guard !code.isEmpty else {
            errorMessage = "Введите код из СМС"
            return
        }
        isLoading = true
        defer { isLoading = false }
        do {
            try await authStore.login(phone: phone, code: code)
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

// MARK: - View

struct AuthView: View {
    @EnvironmentObject var authStore: AuthStore

    @StateObject private var viewModel: AuthViewModel

    init(service: APIService) {
        _viewModel = StateObject(wrappedValue: AuthViewModel(service: service))
    }

    var body: some View {
        VStack(spacing: 24) {
            Spacer()

            Text("VITTORIA HOME")
                .font(.largeTitle.bold())
                .tracking(2)

            Group {
                switch viewModel.step {
                case .phone:
                    phoneStep
                case .code:
                    codeStep
                }
            }
            .padding(.horizontal, 24)

            if let error = viewModel.errorMessage {
                Text(error)
                    .foregroundColor(.red)
                    .font(.footnote)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 24)
            }

            if viewModel.isLoading {
                ProgressView()
            }

            Spacer()
        }
    }

    // MARK: Steps

    private var phoneStep: some View {
        VStack(spacing: 16) {
            TextField("+7…", text: $viewModel.phone)
                .keyboardType(.phonePad)
                .textContentType(.telephoneNumber)
                .textFieldStyle(.roundedBorder)

            Button("Получить код") {
                Task { await viewModel.requestCode() }
            }
            .buttonStyle(.borderedProminent)
            .disabled(viewModel.isLoading)
        }
    }

    private var codeStep: some View {
        VStack(spacing: 16) {
            Text("Код отправлен на \(viewModel.phone)")
                .font(.footnote)
                .foregroundColor(.secondary)

            TextField("Код", text: $viewModel.code)
                .keyboardType(.numberPad)
                .textContentType(.oneTimeCode)
                .textFieldStyle(.roundedBorder)

            Button("Войти") {
                Task { await viewModel.login(authStore: authStore) }
            }
            .buttonStyle(.borderedProminent)
            .disabled(viewModel.isLoading)

            Button("Изменить номер") {
                viewModel.step = .phone
                viewModel.code = ""
                viewModel.errorMessage = nil
            }
            .font(.footnote)
        }
    }
}
