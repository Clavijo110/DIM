export const TOTAL_CAROUSEL_POSITIONS = 8
export const MEDICATION_COMPARTMENT_COUNT = 7
export const NIGHT_WINDOW_START_HOUR = 0
export const NIGHT_WINDOW_END_HOUR = 6

export function getSlotAngle(slotNumber) {
  const slot = Number(slotNumber)
  if (!Number.isFinite(slot) || slot <= 1) {
    return 0
  }

  return ((slot - 1) % TOTAL_CAROUSEL_POSITIONS) * 45
}

export function isRestrictedNightWindow(date = new Date()) {
  return isWithinBlockedWindow(
    date,
    `${String(NIGHT_WINDOW_START_HOUR).padStart(2, '0')}:00`,
    `${String(NIGHT_WINDOW_END_HOUR).padStart(2, '0')}:00`,
  )
}

export function isWithinBlockedWindow(date = new Date(), startTime = '00:00', endTime = '06:00') {
  const start = parseTimeToMinutes(startTime)
  const end = parseTimeToMinutes(endTime)
  if (start === null || end === null || start === end) return false

  const current = date.getHours() * 60 + date.getMinutes()
  if (start < end) return current >= start && current < end
  return current >= start || current < end
}

function parseTimeToMinutes(time) {
  if (typeof time !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) return null

  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
}

export function isValidMedicationFrequencyHours(value) {
  const hours = Number(value)
  return Number.isInteger(hours) && hours >= 1 && hours <= 168
}

export function isValidMedicationDose(value) {
  const dose = String(value ?? '')
  return /^\d+$/.test(dose) && Number.isSafeInteger(Number(dose)) && Number(dose) > 0
}

export function isValidMedicationStartTime(value) {
  return typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)
}

export function isSlotAvailable(slotConfig, slotNumber, date = new Date(), nightStart = '00:00', nightEnd = '06:00') {
  const current = Number(slotNumber)
  const exists = slotConfig && Number(slotConfig.slot) === current
  if (!exists) return false
  if (isWithinBlockedWindow(date, nightStart, nightEnd)) return false
  return Number(slotConfig.amount || 0) > 0 && Boolean(slotConfig.medicationName && slotConfig.medicationName.trim())
}

export function getNextAvailableSlot(slots = [], startFrom = 0, date = new Date(), nightStart = '00:00', nightEnd = '06:00') {
  const items = [...slots]
    .filter((slot) => slot && slot.slot)
    .sort((a, b) => Number(a.slot) - Number(b.slot))

  if (!items.length) {
    return null
  }

  const safeSlots = items.filter((slot) => isSlotAvailable(slot, Number(slot.slot), date, nightStart, nightEnd))
  if (!safeSlots.length) {
    return null
  }

  const startIndex = Number(startFrom) || 0
  const ordered = [...safeSlots, ...safeSlots].slice(startIndex, startIndex + safeSlots.length)
  return ordered[0] || safeSlots[0]
}
