import { describe, expect, it } from 'vitest'
import {
  isRestrictedNightWindow,
  isSlotAvailable,
  getSlotAngle,
  getNextAvailableSlot,
} from './dispenserLogic'
import { emptyCompartments, formatSupabaseAuthError, withSupabaseTimeout } from './supabase'

describe('dispenserLogic', () => {
  it('blocks dispensing between 00:00 and 05:59', () => {
    expect(isRestrictedNightWindow(new Date('2026-09-25T02:00:00'))).toBe(true)
    expect(isRestrictedNightWindow(new Date('2026-09-25T07:00:00'))).toBe(false)
  })

  it('validates a single-pill slot and 45° spacing', () => {
    expect(getSlotAngle(1)).toBe(0)
    expect(getSlotAngle(3)).toBe(90)
    expect(isSlotAvailable({ slot: 1, medicationName: 'Metformina', amount: 1 }, 1, new Date('2026-09-25T09:00:00'))).toBe(true)
    expect(isSlotAvailable({ slot: 1, medicationName: 'Metformina', amount: 0 }, 1, new Date('2026-09-25T09:00:00'))).toBe(false)
  })

  it('returns the next slot in normal order', () => {
    const slots = [
      { slot: 1, medicationName: 'Metformina', amount: 1 },
      { slot: 2, medicationName: 'Vitamina D', amount: 1 },
      { slot: 3, medicationName: 'Ibuprofeno', amount: 1 },
    ]

    expect(getNextAvailableSlot(slots, 0, new Date('2026-09-25T09:00:00'))).toMatchObject({ slot: 1 })
  })

  it('translates common Supabase auth errors into actionable messages', () => {
    expect(formatSupabaseAuthError({ message: 'Email signups are disabled' })).toContain('Email')
    expect(formatSupabaseAuthError({ message: 'redirect_to not allowed' })).toContain('URL')
    expect(formatSupabaseAuthError({ message: 'User already registered' })).toContain('ya existe')
  })

  it('starts every account with eight unconfigured compartments', () => {
    expect(emptyCompartments).toHaveLength(8)
    expect(emptyCompartments.every((slot) => slot.medicationName === 'Sin asignar' && slot.frequencyHours === null && slot.amount === 0 && !slot.active)).toBe(true)
  })

  it('ends a stalled Supabase request with a timeout error', async () => {
    const stalledRequest = new Promise(() => {})

    await expect(withSupabaseTimeout(stalledRequest, 1, 'Supabase timeout')).rejects.toThrow('Supabase timeout')
  })
})
