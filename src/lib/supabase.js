import { createClient } from '@supabase/supabase-js'

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ''
export const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
      global: { headers: { 'x-application': 'dim-dispensador' } },
    })
  : null

export function withSupabaseTimeout(promise, timeoutMs = 12000, message = 'Supabase tardó demasiado en responder') {
  return new Promise((resolve, reject) => {
    const timeoutId = globalThis.setTimeout(() => reject(new Error(message)), timeoutMs)

    Promise.resolve(promise).then(
      (value) => {
        globalThis.clearTimeout(timeoutId)
        resolve(value)
      },
      (error) => {
        globalThis.clearTimeout(timeoutId)
        reject(error)
      },
    )
  })
}

export const emptyCompartments = Array.from({ length: 8 }, (_, index) => ({
  slot: index + 1,
  medicationName: 'Sin asignar',
  dose: '',
  frequencyHours: null,
  amount: 0,
  active: false,
  notes: '',
  rotation: index,
}))

export const defaultDeviceSettings = {
  name: '',
  wifiName: '',
  connectionStatus: 'Sin configurar',
  voiceMessage: '',
  nightStart: '00:00',
  nightEnd: '06:00',
}

export function formatSupabaseAuthError(error) {
  const rawMessage = error?.message || ''
  const normalized = rawMessage.toLowerCase()

  if (normalized.includes('signups are disabled') || normalized.includes('email providers') || normalized.includes('email auth')) {
    return 'La autenticación por email está desactivada en Supabase. Ve a Authentication > Providers > Email y habilítala.'
  }

  if (normalized.includes('redirect_to') || normalized.includes('redirect') || normalized.includes('not allowed')) {
    return 'Falta configurar la URL de redirección en Supabase. Agrega http://localhost:5173 y tu dominio en Authentication > URL Configuration.'
  }

  if (normalized.includes('user already registered') || normalized.includes('already registered') || normalized.includes('already exists') || normalized.includes('duplicate')) {
    return 'Este correo ya existe en la base de datos. Intenta iniciar sesión o recupera tu contraseña.'
  }

  if (normalized.includes('invalid login credentials')) {
    return 'Credenciales inválidas. Revisa el correo y la contraseña.'
  }

  if (normalized.includes('email not confirmed') || normalized.includes('confirm your email')) {
    return 'La cuenta se creó correctamente, pero primero debes confirmar tu correo antes de entrar.'
  }

  if (normalized.includes('timeout') || normalized.includes('too long') || normalized.includes('tardó demasiado')) {
    return 'Supabase no respondió a tiempo. Revisa tu conexión y la URL del proyecto en .env; la app te permitirá intentarlo otra vez.'
  }

  if (normalized.includes('password')) {
    return 'La contraseña no cumple los requisitos de seguridad.'
  }

  return rawMessage || 'No se pudo completar la autenticación.'
}

export async function fetchDispenserState(userId) {
  if (!supabase || !userId) {
    return {
      compartments: emptyCompartments,
      device: defaultDeviceSettings,
      notifications: [],
      dispenseEvents: [],
      deviceConfigured: false,
    }
  }

  try {
    const [{ data: compartmentsData, error: compartmentError }, { data: deviceData, error: deviceError }, { data: notificationsData, error: notificationError }, { data: dispenseEventsData, error: eventsError }] = await withSupabaseTimeout(Promise.all([
      supabase.from('dispenser_compartments').select('*').eq('user_id', userId).order('slot', { ascending: true }),
      supabase.from('dispenser_settings').select('*').eq('user_id', userId).maybeSingle(),
      supabase.from('notifications').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(5),
      supabase.from('dispense_events').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(20),
    ]), 12000)

    if (compartmentError) {
      console.warn('Error al cargar compartimentos:', compartmentError)
    }
    if (deviceError || notificationError || eventsError) {
      console.warn('No se pudieron cargar todos los datos del dispensador:', deviceError || notificationError || eventsError)
    }

    return {
      compartments: [...(compartmentsData || []).map((item) => ({
        slot: Number(item.slot),
        medicationName: item.medication_name || 'Sin asignar',
        dose: item.dose || '',
        frequencyHours: item.frequency_hours == null ? null : Number(item.frequency_hours),
        amount: Number(item.amount || 0),
        active: Boolean(item.active),
        notes: item.notes || '',
        rotation: Number(item.rotation ?? item.slot - 1),
      })), ...emptyCompartments.filter((empty) => !(compartmentsData || []).some((item) => Number(item.slot) === empty.slot))].sort((a, b) => a.slot - b.slot),
      device: deviceData ? {
        name: deviceData.name || '',
        wifiName: deviceData.wifi_name || '',
        connectionStatus: deviceData.connection_status || 'Sin configurar',
        voiceMessage: deviceData.voice_message || '',
        nightStart: deviceData.night_start || '00:00',
        nightEnd: deviceData.night_end || '06:00',
      } : defaultDeviceSettings,
      notifications: notificationsData || [],
      dispenseEvents: dispenseEventsData || [],
      deviceConfigured: Boolean(deviceData),
      loadError: compartmentError || deviceError || notificationError || eventsError
        ? (compartmentError || deviceError || notificationError || eventsError).message
        : '',
    }
  } catch (error) {
    console.error('Supabase fetch error:', error)
    return {
      compartments: emptyCompartments,
      device: defaultDeviceSettings,
      notifications: [],
      dispenseEvents: [],
      deviceConfigured: false,
      loadError: error?.message || 'No se pudieron cargar los datos del dispensador',
    }
  }
}

export async function upsertCompartments(compartments, userId) {
  if (!supabase) {
    return { success: true, localOnly: true, data: compartments }
  }

  const payload = compartments.map((item) => ({
    user_id: userId,
    slot: Number(item.slot),
    medication_name: item.medicationName || 'Sin asignar',
    dose: item.dose || '',
    frequency_hours: item.frequencyHours == null ? null : Number(item.frequencyHours),
    amount: Number(item.amount || 0),
    active: Boolean(item.active),
    notes: item.notes || '',
    rotation: Number(item.rotation ?? item.slot - 1),
  }))

  if (!userId) return { success: false, error: new Error('No hay usuario autenticado para guardar') }

  const { data, error } = await supabase.from('dispenser_compartments').upsert(payload, { onConflict: 'user_id,slot' })

  if (error) {
    console.error('No se pudo guardar la configuración:', error)
    return { success: false, error }
  }

  return { success: true, localOnly: false, data }
}

export async function upsertDeviceSettings(settings = defaultDeviceSettings, userId) {
  if (!supabase) {
    return { success: true, localOnly: true, data: settings }
  }

  const payload = {
    user_id: userId,
    name: settings.name || defaultDeviceSettings.name || 'Mi dispensador',
    wifi_name: settings.wifiName || defaultDeviceSettings.wifiName || '',
    connection_status: settings.connectionStatus || defaultDeviceSettings.connectionStatus,
    voice_message: settings.voiceMessage || defaultDeviceSettings.voiceMessage || '',
    night_start: settings.nightStart || defaultDeviceSettings.nightStart,
    night_end: settings.nightEnd || defaultDeviceSettings.nightEnd,
  }

  if (!userId) return { success: false, error: new Error('No hay usuario autenticado para guardar') }

  const { data, error } = await supabase.from('dispenser_settings').upsert(payload, { onConflict: 'user_id' })

  if (error) {
    console.error('No se pudo guardar la configuración del dispositivo:', error)
    return { success: false, error }
  }

  return { success: true, localOnly: false, data }
}

export async function signUpWithEmail({ email, password, fullName }) {
  if (!supabase) {
    return { data: null, error: new Error('Supabase no está configurado') }
  }

  const redirectBase = typeof window !== 'undefined' && window.location?.origin
    ? window.location.origin
    : 'http://localhost:5173'

  return withSupabaseTimeout(supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${redirectBase}/`,
      data: {
        full_name: fullName || email,
      },
    },
  }), 12000)
}

export async function signInWithEmail({ email, password }) {
  if (!supabase) {
    return { data: null, error: new Error('Supabase no está configurado') }
  }

  return withSupabaseTimeout(supabase.auth.signInWithPassword({ email, password }), 12000)
}

export async function signOut() {
  if (!supabase) {
    return { error: null }
  }

  const { error } = await supabase.auth.signOut()
  return { error }
}

export async function fetchUserProfile(userId) {
  if (!supabase || !userId) {
    return { data: null, error: null }
  }

  return supabase.from('profiles').select('id, email, full_name, avatar_url').eq('id', userId).maybeSingle()
}

export async function syncUserProfile(user, fullName) {
  if (!supabase || !user) {
    return { success: true, localOnly: true }
  }

  const profileName = fullName?.trim() || user.user_metadata?.full_name || user.email?.split('@')[0] || 'Usuario'
  const { error } = await supabase.from('profiles').upsert({
    id: user.id,
    email: user.email,
    full_name: profileName,
    avatar_url: user.user_metadata?.avatar_url || null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'id' })

  if (error) {
    console.warn('No se pudo sincronizar el perfil del usuario:', error)
    return { success: false, error }
  }

  return { success: true }
}

export async function updateUserProfile(user, { fullName }) {
  if (!supabase || !user) {
    return { success: false, error: new Error('No hay una sesión de Supabase activa') }
  }

  const name = fullName?.trim()
  if (!name) {
    return { success: false, error: new Error('Escribe tu nombre para guardar el perfil') }
  }

  const { data, error } = await supabase.auth.updateUser({ data: { full_name: name } })
  if (error) return { success: false, error }

  const result = await syncUserProfile(data.user || user, name)
  if (!result.success) return result

  return { success: true, data: { full_name: name, email: user.email } }
}

export async function sendNotification({ title, message, priority = 'normal', userId }) {
  if (!supabase) {
    return { success: true, localOnly: true }
  }

  const { error } = await supabase.from('notifications').insert({
    user_id: userId,
    title,
    message,
    priority,
    created_at: new Date().toISOString(),
  })

  if (error) {
    console.error('No se pudo registrar la notificación:', error)
    return { success: false, error }
  }

  return { success: true }
}

export async function sendDispenseEvent({ slot, medicationName, message, userId }) {
  if (!supabase) {
    return { success: true, localOnly: true }
  }

  const { data, error } = await supabase.from('dispense_events').insert({
    user_id: userId,
    slot,
    medication_name: medicationName,
    message,
    created_at: new Date().toISOString(),
  }).select().single()

  if (error) {
    console.error('No se pudo registrar el evento de dispensación:', error)
    return { success: false, error }
  }

  return { success: true, data }
}
