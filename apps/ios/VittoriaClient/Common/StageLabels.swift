import Foundation

// MARK: - Stage labels

/// Maps API stage keys to Russian display strings.
let stageLabels: [String: String] = [
    "preparation_for_production": "Подготовка для производства",
    "detailing":                  "Деталировка",
    "materials_arrival":          "Поступление материалов на склад",
    "production":                 "Производство изделия",
    "transfer_to_warehouse":      "Передача готового изделия на склад",
    "completeness_check":         "Проверка комплектности товара",
    "ready_for_delivery":         "Готовность к передаче клиенту"
]

/// Ordered list of stage keys (production pipeline order).
let stages: [String] = [
    "preparation_for_production",
    "detailing",
    "materials_arrival",
    "production",
    "transfer_to_warehouse",
    "completeness_check",
    "ready_for_delivery"
]

/// Returns the Russian label for a stage key, falling back to the raw key.
func stageLabel(_ s: String) -> String {
    stageLabels[s] ?? s
}
