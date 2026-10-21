import { afterEach, describe, expect, it, vi } from 'vitest'
import { deviceApi, normalizeDeviceUrl, requestDevice } from './deviceApi'

afterEach(() => vi.restoreAllMocks())

describe('deviceApi', () => {
  it('normalizes an ESP32 host to an HTTP origin', () => {
    expect(normalizeDeviceUrl(' 192.168.4.1/ ')).toBe('http://192.168.4.1')
    expect(normalizeDeviceUrl('https://dispenser.local/path')).toBe('https://dispenser.local')
  })

  it('rejects a carousel position outside the 0-7 hardware range', () => {
    expect(() => deviceApi.moveCarousel('192.168.4.1', 8)).toThrow(RangeError)
  })

  it('sends the one-second carousel vibration command', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ accepted: true, completed: true }),
    })

    await deviceApi.vibrateCarousel('192.168.4.20', 'local-device-key')

    expect(fetchMock).toHaveBeenCalledWith('http://192.168.4.20/api/v1/carousel/vibrate', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ Authorization: 'Bearer local-device-key' }),
    }))
  })

  it('sends an explicit carousel compartment cycle without a feeder command', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ accepted: true, completed: true }),
    })

    await deviceApi.runCarouselCompartment('192.168.4.20', 3, 'local-device-key')

    expect(fetchMock).toHaveBeenCalledWith('http://192.168.4.20/api/v1/carousel/compartment', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ Authorization: 'Bearer local-device-key' }),
      body: JSON.stringify({ compartment: 3 }),
    }))
  })

  it('sends an explicit all-compartments carousel test command', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ accepted: true, completed: true }),
    })

    await deviceApi.testAllCarouselCompartments('192.168.4.20', 'local-device-key')

    expect(fetchMock).toHaveBeenCalledWith('http://192.168.4.20/api/v1/carousel/test', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ Authorization: 'Bearer local-device-key' }),
    }))
  })

  it('rejects compartment eight because the physical carousel has seven compartments', () => {
    expect(() => deviceApi.dispense('192.168.4.1', 8)).toThrow(RangeError)
  })

  it('rejects unsupported singularizer sizes', () => {
    expect(() => deviceApi.moveFeeder('192.168.4.1', 'capsule')).toThrow(RangeError)
    expect(() => deviceApi.dispense('192.168.4.1', 3, 'capsule')).toThrow(RangeError)
    expect(() => deviceApi.dispense('192.168.4.1', 3, 2, 'key', 0)).toThrow(RangeError)
  })

  it('sends the configured singularizer size for a motor test', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ accepted: true, completed: true }),
    })

    await deviceApi.moveFeeder('192.168.4.20', 'large', 'local-device-key')

    expect(fetchMock).toHaveBeenCalledWith('http://192.168.4.20/api/v1/feeder/position', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ pillSize: 'large' }),
    }))
  })

  it('sends compartment indicator selections to Q1-Q7 control', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ accepted: true }),
    })

    await deviceApi.indicateCompartment('192.168.4.20', 7, 'local-device-key')

    expect(fetchMock).toHaveBeenCalledWith('http://192.168.4.20/api/v1/indicators/compartment', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ compartment: 7 }),
    }))
  })

  it('sends a timed Q0 output-light test command', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ accepted: true, durationMs: 10000 }),
    })

    await deviceApi.testOutputIndicator('192.168.4.20', 'local-device-key')

    expect(fetchMock).toHaveBeenCalledWith('http://192.168.4.20/api/v1/indicators/output', expect.objectContaining({
      method: 'POST',
    }))
  })

  it('sends an audio test track and validates its track and volume', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ accepted: true }),
    })

    await deviceApi.playAudioTrack('192.168.4.20', 4, 18, 'local-device-key')

    expect(fetchMock).toHaveBeenCalledWith('http://192.168.4.20/api/v1/audio/play', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ track: 4, volume: 18 }),
    }))
    expect(() => deviceApi.playAudioTrack('192.168.4.20', 0, 18)).toThrow(RangeError)
    expect(() => deviceApi.playAudioTrack('192.168.4.20', 256, 18)).toThrow(RangeError)
    expect(() => deviceApi.playAudioTrack('192.168.4.20', 1, 31)).toThrow(RangeError)
  })

  it('sends a versioned explicit dispense command', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ accepted: true }),
    })

    await deviceApi.dispense('192.168.4.20', 3, 'small', 'local-device-key', 3)

    expect(fetchMock.mock.calls[0][1].headers.Authorization).toMatch(/^Bearer .+/)
    expect(fetchMock).toHaveBeenCalledWith('http://192.168.4.20/api/v1/dispense', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ Authorization: expect.stringMatching(/^Bearer .+/) }),
      body: JSON.stringify({ compartment: 3, pillSize: 'small', pillsPerDose: 3 }),
    }))
  })

  it('sends the phone timezone when syncing the RTC', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ accepted: true }),
    })
    const date = new Date('2026-10-15T12:00:00Z')

    await deviceApi.setClock('192.168.4.20', date, 'local-device-key')

    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer local-device-key')
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      unixTime: Math.floor(date.getTime() / 1000),
      timezoneOffsetMinutes: -date.getTimezoneOffset(),
    })
  })

  it('sends validated recurring medication schedules to the ESP32', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ accepted: true, scheduleCount: 1 }),
    })

    await deviceApi.setSchedules('192.168.4.20', [{
      slot: 2,
      active: true,
      medicationName: 'Vitamina D',
      startTime: '08:30',
      frequencyHours: 12,
      pillSize: 'medium',
      pillsPerDose: 2,
      amount: 20,
    }], 'local-device-key')

    expect(fetchMock).toHaveBeenCalledWith('http://192.168.4.20/api/v1/schedule', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        schedules: [{
          compartment: 2,
          medicationName: 'Vitamina D',
          pillSize: 'medium',
          startHour: 8,
          startMinute: 30,
          frequencyHours: 12,
          pillsPerDose: 2,
          amount: 20,
        }],
      }),
    }))
  })

  it('can clear the schedule stored on the ESP32 without removing local medication data', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ accepted: true, scheduleCount: 0 }),
    })

    await deviceApi.setSchedules('192.168.4.20', [], 'local-device-key')

    expect(fetchMock).toHaveBeenCalledWith('http://192.168.4.20/api/v1/schedule', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ schedules: [] }),
    }))
  })

  it('schedules one future dose for a configured compartment using minutes from now', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ accepted: true }),
    })

    await deviceApi.scheduleOnce('192.168.4.20', 3, 12, 'local-device-key')

    expect(fetchMock).toHaveBeenCalledWith('http://192.168.4.20/api/v1/schedule/once', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        compartment: 3,
        minutesFromNow: 12,
      }),
    }))
  })

  it('rejects invalid compartments and minute delays outside the allowed range', () => {
    expect(() => deviceApi.scheduleOnce('192.168.4.20', 8, 5)).toThrow(RangeError)
    expect(() => deviceApi.scheduleOnce('192.168.4.20', 1, 0)).toThrow(RangeError)
    expect(() => deviceApi.scheduleOnce('192.168.4.20', 1, 10081)).toThrow(RangeError)
    expect(() => deviceApi.scheduleOnce('192.168.4.20', 1, 1.5)).toThrow(RangeError)
  })

  it('cancels a pending one-time dose', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ accepted: true }),
    })

    await deviceApi.cancelScheduleOnce('192.168.4.20', 'local-device-key')

    expect(fetchMock).toHaveBeenCalledWith('http://192.168.4.20/api/v1/schedule/once/cancel', expect.objectContaining({
      method: 'POST',
    }))
  })

  it('rejects invalid times and singularizer sizes in a schedule', () => {
    expect(() => deviceApi.setSchedules('192.168.4.20', [{
      slot: 1, active: true, medicationName: 'Medicamento', startTime: '24:00',
      frequencyHours: 8, pillSize: 'large', amount: 10,
    }])).toThrow(RangeError)
    expect(() => deviceApi.setSchedules('192.168.4.20', [{
      slot: 1, active: true, medicationName: 'Medicamento', startTime: '08:00',
      frequencyHours: 8, pillSize: 'capsule', amount: 10,
    }])).toThrow(RangeError)
    expect(() => deviceApi.setSchedules('192.168.4.20', [{
      slot: 1, active: true, medicationName: 'Medicamento', startTime: '08:00',
      frequencyHours: 8, pillSize: 'large', pillsPerDose: 3, amount: 2,
    }])).toThrow(RangeError)
  })

  it('reports an error returned by the device', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ error: 'Motor ocupado' }),
    })

    await expect(requestDevice('192.168.4.20', '/status')).rejects.toThrow('Motor ocupado')
  })

  it('explains when the connected firmware does not expose a requested function', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ error: 'Ruta no encontrada' }),
    })

    await expect(requestDevice('192.168.4.20', '/audio/play'))
      .rejects.toThrow('Actualiza el ESP32 a la versión integrada compatible')
  })
})