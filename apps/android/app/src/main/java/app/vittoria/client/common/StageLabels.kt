package app.vittoria.client.common

/**
 * Russian display labels for the 7 order stages as defined in the Vittoria spec.
 * Keys are the stage identifiers used in [app.vittoria.client.data.dto.OrderDto.current_stage].
 */
val STAGE_LABELS: Map<String, String> = mapOf(
    "new"                  to "Новый заказ",
    "in_production"        to "В производстве",
    "ready_for_delivery"   to "Готово к доставке",
    "delivery"             to "Доставка",
    "installation"         to "Монтаж",
    "finishing_touches"    to "Финальные работы",
    "completed"            to "Завершён"
)

/**
 * Returns the Russian label for [stage], or the raw stage key if no label is found.
 */
fun stageLabel(stage: String): String = STAGE_LABELS[stage] ?: stage
