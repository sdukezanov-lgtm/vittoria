package app.vittoria.client.common

/**
 * Russian display labels for the 7 order stages as defined in the Vittoria spec.
 * Keys are the exact backend enum values used in [app.vittoria.client.data.dto.OrderDto.current_stage].
 */
val STAGE_LABELS: Map<String, String> = mapOf(
    "preparation_for_production" to "Подготовка для производства",
    "detailing"                  to "Деталировка",
    "materials_arrival"          to "Поступление материалов на склад",
    "production"                 to "Производство изделия",
    "transfer_to_warehouse"      to "Передача готового изделия на склад",
    "completeness_check"         to "Проверка комплектности товара",
    "ready_for_delivery"         to "Готовность к передаче клиенту",
)

/** Ordered list of the 7 stages (for timelines / progress). */
val STAGES: List<String> = listOf(
    "preparation_for_production",
    "detailing",
    "materials_arrival",
    "production",
    "transfer_to_warehouse",
    "completeness_check",
    "ready_for_delivery",
)

/**
 * Returns the Russian label for [stage], or the raw stage key if no label is found.
 */
fun stageLabel(stage: String): String = STAGE_LABELS[stage] ?: stage
