const API_PREFIX = '/api/v1'
const COMMAND_TIMEOUT_MS = 180000

export function normalizeDeviceUrl(value) {
  const trimmed = String(value || '').trim().replace(/\/+$/, '')
  if (!trimmed) throw new Error('Introduce la dirección del dispensador')

  const url = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`
  return new URL(url).origin
}

export async function requestDevice(deviceUrl, path, options = {}, deviceKey = '') {
  const baseUrl = normalizeDeviceUrl(deviceUrl)
  const { timeoutMs = 5000, ...fetchOptions } = options
  const response = await fetch(`${baseUrl}${API_PREFIX}${path}`, {
    ...fetchOptions,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${deviceKey}`,
      ...options.headers,
    },
    signal: AbortSignal.timeout(timeoutMs),
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('El firmware no reconoce esta función de DIM. Actualiza el ESP32 a la versión integrada compatible.')
    }
    throw new Error(payload.error || `El dispensador respondió ${response.status}`)
  }
  return payload
}

export const deviceApi = {
  status: (url, key) => requestDevice(url, '/status', {}, key),
  homeCarousel: (url, key) => requestDevice(url, '/carousel/home', { method: 'POST', timeoutMs: COMMAND_TIMEOUT_MS }, key),
  moveCarousel: (url, position, key) => {
    if (!Number.isInteger(position) || position < 0 || position > 7) {
      throw new RangeError('La posición del carrusel debe estar entre 0 y 7')
    }
    return requestDevice(url, '/carousel/position', {
      method: 'POST',
      timeoutMs: COMMAND_TIMEOUT_MS,
      body: JSON.stringify({ position }),
    }, key)
  },
  vibrateCarousel: (url, key) => requestDevice(url, '/carousel/vibrate', {
    method: 'POST',
    timeoutMs: COMMAND_TIMEOUT_MS,
  }, key),
  runCarouselCompartment: (url, compartment, key) => {
    if (!Number.isInteger(compartment) || compartment < 1 || compartment > 7) {
      throw new RangeError('El compartimento físico debe estar entre 1 y 7')
    }
    return requestDevice(url, '/carousel/compartment', {
      method: 'POST',
      timeoutMs: COMMAND_TIMEOUT_MS,
      body: JSON.stringify({ compartment }),
    }, key)
  },
  testAllCarouselCompartments: (url, key) => requestDevice(url, '/carousel/test', {
    method: 'POST',
    timeoutMs: COMMAND_TIMEOUT_MS,
  }, key),
  homeFeeder: (url, key) => requestDevice(url, '/feeder/home', { method: 'POST', timeoutMs: COMMAND_TIMEOUT_MS }, key),
  indicateCompartment: (url, compartment, key) => {
    if (!Number.isInteger(compartment) || compartment < 1 || compartment > 7) {
      throw new RangeError('El compartimento indicado debe estar entre 1 y 7')
    }
    return requestDevice(url, '/indicators/compartment', {
      method: 'POST',
      body: JSON.stringify({ compartment }),
    }, key)
  },
  testOutputIndicator: (url, key) => requestDevice(url, '/indicators/output', {
    method: 'POST',
  }, key),
  playAudioTrack: (url, track, volume, key) => {
    if (!Number.isInteger(track) || track < 1 || track > 255) {
      throw new RangeError('El número de pista debe estar entre 1 y 255')
    }
    if (!Number.isInteger(volume) || volume < 0 || volume > 30) {
      throw new RangeError('El volumen debe estar entre 0 y 30')
    }
    return requestDevice(url, '/audio/play', {
      method: 'POST',
      body: JSON.stringify({ track, volume }),
    }, key)
  },
  moveFeeder: (url, pillSize, key) => {
    if (!['large', 'small', 'medium'].includes(pillSize)) {
      throw new RangeError('El tamaño de pastilla debe ser grande, pequeña o mediana')
    }
    return requestDevice(url, '/feeder/position', {
      method: 'POST',
      timeoutMs: COMMAND_TIMEOUT_MS,
      body: JSON.stringify({ pillSize }),
    }, key)
  },
  dispense: (url, compartment, pillSize, key, pillsPerDose = 1) => {
    if (!Number.isInteger(compartment) || compartment < 1 || compartment > 7) {
      throw new RangeError('El compartimento físico debe estar entre 1 y 7')
    }
    if (!['large', 'small', 'medium'].includes(pillSize)) {
      throw new RangeError('El tamaño de pastilla debe ser grande, pequeña o mediana')
    }
    if (!Number.isInteger(pillsPerDose) || pillsPerDose < 1 || pillsPerDose > 60) {
      throw new RangeError('La cantidad de pastillas por toma debe estar entre 1 y 60')
    }
    return requestDevice(url, '/dispense', {
      method: 'POST',
      timeoutMs: Math.max(COMMAND_TIMEOUT_MS, pillsPerDose * 30000),
      body: JSON.stringify({ compartment, pillSize, pillsPerDose }),
    }, key)
  },
  setClock: (url, date = new Date(), key) => requestDevice(url, '/clock', {
    method: 'POST',
    timeoutMs: COMMAND_TIMEOUT_MS,
    body: JSON.stringify({
      unixTime: Math.floor(date.getTime() / 1000),
      timezoneOffsetMinutes: -date.getTimezoneOffset(),
    }),
  }, key),
  setSchedules: (url, compartments, key) => {
    const configured = compartments.filter((item) => (
      item.active && item.medicationName && item.medicationName !== 'Sin asignar'
    ))
    const schedules = configured.map((item) => {
      const start = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(item.startTime || '')
      const frequencyHours = Number(item.frequencyHours)
      const pillSize = item.pillSize
      const medicationName = String(item.medicationName || '').trim()
      const medicationNameBytes = new TextEncoder().encode(medicationName).length
      const amount = Number(item.amount)
      const pillsPerDose = Number(item.pillsPerDose || 1)
      if (!start || !Number.isInteger(frequencyHours) || frequencyHours < 1 || frequencyHours > 168
          || !medicationName || medicationNameBytes > 24
          || !['large', 'small', 'medium'].includes(pillSize)
          || !Number.isInteger(amount) || amount < 1 || amount > 60
          || !Number.isInteger(pillsPerDose) || pillsPerDose < 1 || pillsPerDose > 60 || amount < pillsPerDose) {
        throw new RangeError(`La configuración automática del compartimento ${item.slot} no es válida`)
      }
      return {
        compartment: Number(item.slot),
        medicationName,
        pillSize,
        startHour: Number(start[1]),
        startMinute: Number(start[2]),
        frequencyHours,
        pillsPerDose,
        amount,
      }
    })
    if (configured.length > 7 || schedules.some((item) => !Number.isInteger(item.compartment) || item.compartment < 1 || item.compartment > 7)) {
      throw new RangeError('La agenda debe contener como máximo siete compartimentos válidos')
    }
    return requestDevice(url, '/schedule', {
      method: 'POST',
      timeoutMs: COMMAND_TIMEOUT_MS,
      body: JSON.stringify({ schedules }),
    }, key)
  },
  scheduleOnce: (url, compartment, minutesFromNow, key) => {
    if (!Number.isInteger(compartment) || compartment < 1 || compartment > 7) {
      throw new RangeError('El compartimento debe estar entre 1 y 7')
    }
    if (!Number.isInteger(minutesFromNow) || minutesFromNow < 1 || minutesFromNow > 7 * 24 * 60) {
      throw new RangeError('Indica entre 1 y 10080 minutos')
    }
    return requestDevice(url, '/schedule/once', {
      method: 'POST',
      timeoutMs: COMMAND_TIMEOUT_MS,
      body: JSON.stringify({ compartment, minutesFromNow }),
    }, key)
  },
  cancelScheduleOnce: (url, key) => requestDevice(url, '/schedule/once/cancel', {
    method: 'POST',
  }, key),
}