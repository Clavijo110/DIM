import { describe, expect, it } from 'vitest'
import {
  isRestrictedNightWindow,
  isSlotAvailable,
  getSlotAngle,
  getNextAvailableSlot,
  isWithinBlockedWindow,
  isValidMedicationFrequencyHours,
} from './dispenserLogic'
import { emptyCompartments, formatSupabaseAuthError, withSupabaseTimeout } from './supabase'

describe('dispenserLogic', () => {
  it('blocks only from midnight through 05:59', () => {
    expect(isRestrictedNightWindow(new Date('2026-10-01T00:00:00'))).toBe(true)
    expect(isRestrictedNightWindow(new Date('2026-10-01T05:59:00'))).toBe(true)
    expect(isRestrictedNightWindow(new Date('2026-10-01T06:00:00'))).toBe(false)
    expect(isRestrictedNightWindow(new Date('2026-10-01T23:59:00'))).toBe(false)
  })

  it('supports custom daytime and overnight blocking intervals', () => {
    expect(isWithinBlockedWindow(new Date('2026-10-01T13:30:00'), '13:00', '16:00')).toBe(true)
    expect(isWithinBlockedWindow(new Date('2026-10-01T12:59:00'), '13:00', '16:00')).toBe(false)
    expect(isWithinBlockedWindow(new Date('2026-10-01T16:00:00'), '13:00', '16:00')).toBe(false)
    expect(isWithinBlockedWindow(new Date('2026-10-01T23:00:00'), '22:00', '06:00')).toBe(true)
    expect(isWithinBlockedWindow(new Date('2026-10-01T05:59:00'), '22:00', '06:00')).toBe(true)
    expect(isWithinBlockedWindow(new Date('2026-10-01T06:00:00'), '22:00', '06:00')).toBe(false)
    expect(isWithinBlockedWindow(new Date('2026-10-01T12:00:00'), '22:00', '06:00')).toBe(false)
    expect(isWithinBlockedWindow(new Date('2026-10-01T02:00:00'), 'bad', '06:00')).toBe(false)
    expect(isWithinBlockedWindow(new Date('2026-10-01T02:00:00'), '02:00', '02:00')).toBe(false)
  })

  it('calculates 45-degree slot positions and wraps every eight compartments', () => {
    expect(getSlotAngle(1)).toBe(0)
    expect(getSlotAngle(3)).toBe(90)
    expect(getSlotAngle(8)).toBe(315)
    expect(getSlotAngle(9)).toBe(0)
    expect(getSlotAngle('not-a-slot')).toBe(0)
  })

  it('rejects unavailable slots, blank medication names and configured blocked hours', () => {
    const date = new Date('2026-10-01T10:00:00')
    const configuredSlot = { slot: 1, medicationName: 'Metformina', amount: 1 }

    expect(isSlotAvailable(configuredSlot, 1, date)).toBe(true)
    expect(isSlotAvailable(configuredSlot, 2, date)).toBe(false)
    expect(isSlotAvailable({ ...configuredSlot, amount: 0 }, 1, date)).toBe(false)
    expect(isSlotAvailable({ ...configuredSlot, medicationName: '  ' }, 1, date)).toBe(false)
    expect(isSlotAvailable(configuredSlot, 1, new Date('2026-10-01T02:00:00'))).toBe(false)
    expect(isSlotAvailable(configuredSlot, 1, new Date('2026-10-01T13:30:00'), '13:00', '16:00')).toBe(false)
    expect(isSlotAvailable(configuredSlot, 1, new Date('2026-10-01T12:59:00'), '13:00', '16:00')).toBe(true)
    expect(isSlotAvailable(null, 1, date)).toBe(false)
  })

  it('accepts medication intervals from 1 through 168 whole hours only', () => {
    expect(isValidMedicationFrequencyHours(1)).toBe(true)
    expect(isValidMedicationFrequencyHours('8')).toBe(true)
    expect(isValidMedicationFrequencyHours(168)).toBe(true)
    expect(isValidMedicationFrequencyHours(0)).toBe(false)
    expect(isValidMedicationFrequencyHours(169)).toBe(false)
    expect(isValidMedicationFrequencyHours(1.5)).toBe(false)
    expect(isValidMedicationFrequencyHours('')).toBe(false)
    expect(isValidMedicationFrequencyHours(null)).toBe(false)
  })

  it('returns the next slot in normal order', () => {
    const slots = [
      { slot: 1, medicationName: 'Metformina', amount: 1 },
      { slot: 2, medicationName: 'Vitamina D', amount: 1 },
      { slot: 3, medicationName: 'Ibuprofeno', amount: 1 },
    ]

    expect(getNextAvailableSlot(slots, 0, new Date('2026-10-01T09:00:00'))).toMatchObject({ slot: 1 })
    expect(getNextAvailableSlot(slots, 1, new Date('2026-10-01T09:00:00'))).toMatchObject({ slot: 2 })
    expect(getNextAvailableSlot(slots, 0, new Date('2026-10-01T02:00:00'))).toBeNull()
    expect(getNextAvailableSlot([], 0, new Date('2026-10-01T09:00:00'))).toBeNull()
  })

  it('translates common Supabase auth errors into actionable messages', () => {
    expect(formatSupabaseAuthError({ message: 'Email signups are disabled' })).toContain('Email')
    expect(formatSupabaseAuthError({ message: 'redirect_to not allowed' })).toContain('URL')
    expect(formatSupabaseAuthError({ message: 'User already registered' })).toContain('ya existe')
    expect(formatSupabaseAuthError({ message: 'Invalid login credentials' })).toContain('Credenciales')
    expect(formatSupabaseAuthError({ message: 'Email not confirmed' })).toContain('confirmar')
    expect(formatSupabaseAuthError({ message: 'Database timeout' })).toContain('no respondió')
    expect(formatSupabaseAuthError({ message: '' })).toContain('autenticación')
  })

  it('starts every account with eight unconfigured compartments', () => {
    expect(emptyCompartments).toHaveLength(8)
    expect(emptyCompartments.every((slot) => slot.medicationName === 'Sin asignar' && slot.frequencyHours === null && slot.amount === 0 && !slot.active)).toBe(true)
  })

  it('ends a stalled Supabase request with a timeout error', async () => {
    const stalledRequest = new Promise(() => {})

    await expect(withSupabaseTimeout(stalledRequest, 1, 'Supabase timeout')).rejects.toThrow('Supabase timeout')
  })

  it('passes through a successful request and preserves its rejection', async () => {
    await expect(withSupabaseTimeout(Promise.resolve('ok'), 100)).resolves.toBe('ok')
    await expect(withSupabaseTimeout(Promise.reject(new Error('network error')), 100)).rejects.toThrow('network error')
  })
})
