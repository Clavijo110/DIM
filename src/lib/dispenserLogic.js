export const TOTAL_COMPARTMENTS = 8
export const NIGHT_WINDOW_START_HOUR = 0
export const NIGHT_WINDOW_END_HOUR = 6

export function getSlotAngle(slotNumber) {
  const slot = Number(slotNumber)
  if (!Number.isFinite(slot) || slot <= 1) {
    return 0
  }

  return ((slot - 1) % TOTAL_COMPARTMENTS) * 45
}

export function isRestrictedNightWindow(date = new Date()) {
  const hours = date.getHours()
  return hours >= NIGHT_WINDOW_START_HOUR && hours < NIGHT_WINDOW_END_HOUR
}

export function isValidMedicationFrequencyHours(value) {
  const hours = Number(value)
  return Number.isInteger(hours) && hours >= 1 && hours <= 168
}

export function isSlotAvailable(slotConfig, slotNumber, date = new Date()) {
  const current = Number(slotNumber)
  const exists = slotConfig && Number(slotConfig.slot) === current
  if (!exists) return false
  if (isRestrictedNightWindow(date)) return false
  return Number(slotConfig.amount || 0) > 0 && Boolean(slotConfig.medicationName && slotConfig.medicationName.trim())
}

export function getNextAvailableSlot(slots = [], startFrom = 0, date = new Date()) {
  const items = [...slots]
    .filter((slot) => slot && slot.slot)
    .sort((a, b) => Number(a.slot) - Number(b.slot))

  if (!items.length) {
    return null
  }

  const safeSlots = items.filter((slot) => isSlotAvailable(slot, Number(slot.slot), date))
  if (!safeSlots.length) {
    return null
  }

  const startIndex = Number(startFrom) || 0
  const ordered = [...safeSlots, ...safeSlots].slice(startIndex, startIndex + safeSlots.length)
  return ordered[0] || safeSlots[0]
}
