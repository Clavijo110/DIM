import { StrictMode, useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  Activity, AlertTriangle, Bell, CalendarDays, Check, ChevronRight,
  Clock3, FileText, HeartPulse, Home, Lightbulb, Menu, Mic, Package, Pill, Plus,
  Settings, ShieldCheck, Smartphone, Tablet, UserRound, Wifi,
  X, Zap
} from 'lucide-react'
import './styles.css'
import './device-controls.css'
import { deviceApi, normalizeDeviceUrl } from './lib/deviceApi'
import {
  defaultDeviceSettings,
  fetchUserProfile,
  fetchDispenserState,
  formatSupabaseAuthError,
  sendPasswordResetEmail,
  sendNotification,
  signInWithEmail,
  signUpWithEmail,
  signOut,
  sendDispenseEvent,
  SUPABASE_SESSION_TIMEOUT_MS,
  supabase,
  syncUserProfile,
  updateUserProfile,
  withSupabaseTimeout,
  upsertCompartments,
  upsertDeviceSettings,
} from './lib/supabase'
import {
  getSlotAngle,
  isRestrictedNightWindow,
  isValidMedicationDose,
  isValidMedicationFrequencyHours,
  isValidMedicationStartTime,
} from './lib/dispenserLogic'

const navItems = [
  { id: 'home', label: 'Hoy', icon: Home },
  { id: 'treatments', label: 'Tratamientos', icon: CalendarDays },
  { id: 'dispenser', label: 'Dispensador', icon: Package },
  { id: 'history', label: 'Historial', icon: Activity },
  { id: 'settings', label: 'Ajustes', icon: Settings },
]

const buildDefaultCompartment = (slot) => ({
  slot,
  rotation: slot - 1,
  medicationName: 'Sin asignar',
  dose: '',
  doseUnit: 'mg',
  frequencyHours: null,
  pillsPerDose: 1,
  startTime: '',
  pillSize: null,
  amount: 0,
  active: false,
  notes: '',
})

const defaultCompartments = Array.from({ length: 7 }, (_, index) => buildDefaultCompartment(index + 1))

function getInitialDeviceUrl() {
  const savedUrl = window.localStorage.getItem('dim-device-url')
  return !savedUrl || savedUrl === '192.168.4.5' ? '192.168.4.1' : savedUrl
}

function formatDeviceLocalTime(unixSeconds) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(new Date(Number(unixSeconds) * 1000))
}

function formatTimezoneOffset(offsetMinutes) {
  const offset = Number(offsetMinutes)
  if (!Number.isInteger(offset)) return ''
  const sign = offset >= 0 ? '+' : '-'
  const absoluteMinutes = Math.abs(offset)
  return `UTC${sign}${String(Math.floor(absoluteMinutes / 60)).padStart(2, '0')}:${String(absoluteMinutes % 60).padStart(2, '0')}`
}

function App() {
  const [active, setActive] = useState('home')
  const [modal, setModal] = useState(null)
  const [toast, setToast] = useState('')
  const [loading, setLoading] = useState(true)
  const [dataLoadError, setDataLoadError] = useState('')
  const [session, setSession] = useState(null)
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState({ full_name: '', email: '' })
  const [profileSaving, setProfileSaving] = useState(false)
  const [deviceSettingsSaving, setDeviceSettingsSaving] = useState(false)
  const [authLoading, setAuthLoading] = useState(true)
  const [authError, setAuthError] = useState('')
  const [authMode, setAuthMode] = useState('login')
  const [authForm, setAuthForm] = useState({ fullName: '', email: '', password: '' })
  const [deviceData, setDeviceData] = useState({
    compartments: defaultCompartments,
    device: defaultDeviceSettings,
    notifications: [],
    connected: false,
  })
  const [formData, setFormData] = useState(defaultCompartments)
  const compartmentsRef = useRef(defaultCompartments)
  const inventorySyncInProgressRef = useRef(false)

  useEffect(() => {
    compartmentsRef.current = deviceData.compartments
  }, [deviceData.compartments])

  useEffect(() => {
    let isMounted = true

    const initAuth = async () => {
      if (!supabase) {
        setAuthError('Supabase no está configurado. Comprueba las variables VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.')
        setAuthLoading(false)
        return
      }

      const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
        if (!isMounted) return
        if (event === 'PASSWORD_RECOVERY') setAuthMode('recovery-password')
        setSession(nextSession)
        setUser(nextSession?.user ?? null)
      })

      try {
        const { data: { session: currentSession } } = await withSupabaseTimeout(
          supabase.auth.getSession(),
          SUPABASE_SESSION_TIMEOUT_MS,
          'No se pudo recuperar la sesión a tiempo',
        )
        if (!isMounted) return

        setSession(currentSession)
        setUser(currentSession?.user ?? null)
      } catch (error) {
        if (isMounted) setAuthError(formatSupabaseAuthError(error))
      } finally {
        if (isMounted) setAuthLoading(false)
      }

      return subscription
    }

    const subscriptionPromise = initAuth()

    return () => {
      isMounted = false
      if (subscriptionPromise) {
        subscriptionPromise.then((subscription) => subscription?.unsubscribe?.())
      }
    }
  }, [])

  useEffect(() => {
    if (!user) {
      setProfile({ full_name: '', email: '' })
      return
    }

    let isMounted = true

    const loadProfile = async () => {
      const { data, error } = await fetchUserProfile(user.id)
      if (!isMounted) return

      if (error) {
        console.warn('No se pudo cargar el perfil de Supabase:', error)
      }

      const name = data?.full_name || user.user_metadata?.full_name || user.email?.split('@')[0] || 'Usuario'
      if (!data) await syncUserProfile(user, name)

      if (isMounted) {
        setProfile({ full_name: name, email: data?.email || user.email || '' })
      }
    }

    loadProfile()
    return () => { isMounted = false }
  }, [user])

  useEffect(() => {
    if (!session || !user) return

    setLoading(true)
    setDataLoadError('')
    setDeviceData({
      compartments: defaultCompartments,
      device: defaultDeviceSettings,
      notifications: [],
      dispenseEvents: [],
      connected: false,
    })
    setFormData(defaultCompartments)

    let isMounted = true
    const loadData = async () => {
      try {
        const result = await fetchDispenserState(user.id)
        const compartments = (result.compartments || defaultCompartments).map((item) => ({
          ...item,
          slot: Number(item.slot || 1),
          amount: Number(item.amount || 0),
          rotation: Number(item.rotation ?? item.slot - 1),
          active: Boolean(item.active) || Boolean(item.medicationName && item.medicationName !== 'Sin asignar'),
        }))

        if (!isMounted) return
        setDeviceData({
          compartments,
          device: result.device || defaultDeviceSettings,
          notifications: result.notifications || [],
          dispenseEvents: result.dispenseEvents || [],
          connected: Boolean(result.deviceConfigured && result.device?.connectionStatus === 'Conectado'),
        })
        setFormData(compartments)
        if (result.loadError) setDataLoadError(result.loadError)
      } catch (error) {
        console.error('No se pudieron cargar los datos del dispensador:', error)
        if (isMounted) setDataLoadError(formatSupabaseAuthError(error))
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    loadData()
    return () => { isMounted = false }
  }, [session, user])

  const notify = async (message, title = 'DIM') => {
    setToast(message)
    window.setTimeout(() => setToast(''), 4500)

    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body: message })
    }

    try {
      await sendNotification({ title, message, priority: 'normal', userId: user?.id })
    } catch (error) {
      console.warn('No se pudo guardar la notificación local:', error)
    }
  }

  const handleAuthSubmit = async (event) => {
    event.preventDefault()

    try {
      setAuthLoading(true)
      setAuthError('')

      if (authMode === 'signup') {
        const { data, error } = await signUpWithEmail({
          email: authForm.email,
          password: authForm.password,
          fullName: authForm.fullName,
        })
        if (error) throw error

        if (data?.session) return
        setAuthMode('login')
        setAuthForm((current) => ({ ...current, password: '' }))
        setToast('Cuenta creada. Revisa tu correo para confirmarla.')
        window.setTimeout(() => setToast(''), 4500)
        return
      }

      if (authMode === 'login') {
        const { error } = await signInWithEmail({
          email: authForm.email,
          password: authForm.password,
        })
        if (error) throw error
        return
      }

      if (authMode === 'recovery') {
        const { error } = await sendPasswordResetEmail(authForm.email)
        if (error) throw error

        setAuthMode('recovery-sent')
        return
      }

      if (authMode === 'recovery-password') {
        if (!supabase) throw new Error('Supabase no está configurado.')
        const { error } = await supabase.auth.updateUser({ password: authForm.password })
        if (error) throw error
        await signOut()
        setAuthMode('login')
        setAuthForm((current) => ({ ...current, password: '' }))
        setToast('Contraseña cambiada. Ya puedes entrar.')
        window.setTimeout(() => setToast(''), 3500)
      }
    } catch (error) {
      const message = formatSupabaseAuthError(error)
      setAuthError(message)
      setToast(message)
      window.setTimeout(() => setToast(''), 4200)
      console.error('No se pudo completar la autenticación:', error)
    } finally {
      setAuthLoading(false)
    }
  }

  const handleSignOut = async () => {
    await signOut()
    setSession(null)
    setUser(null)
    setActive('home')
  }

  const saveProfile = async (fullName) => {
    setProfileSaving(true)
    const result = await updateUserProfile(user, { fullName })
    setProfileSaving(false)

    if (!result.success) {
      await notify(result.error?.message || 'No se pudo guardar el perfil', 'Perfil')
      return
    }

    setProfile({ ...result.data, full_name: fullName.trim() })
    setUser((current) => current ? { ...current, user_metadata: { ...current.user_metadata, full_name: fullName.trim() } } : current)
    await notify('Perfil actualizado correctamente', 'Perfil')
  }

  const saveNightWindow = async ({ nightStart, nightEnd }) => {
    setDeviceSettingsSaving(true)
    const result = await upsertDeviceSettings({
      ...deviceData.device,
      name: deviceData.device.name || 'Mi dispensador',
      nightStart,
      nightEnd,
    }, user.id)
    setDeviceSettingsSaving(false)

    if (!result.success) {
      await notify('No se pudo guardar el horario. Revisa la conexión con Supabase.', 'Ajustes')
      return
    }

    setDeviceData((current) => ({
      ...current,
      device: { ...current.device, nightStart, nightEnd },
    }))
    await notify('Horario de bloqueo actualizado', 'Ajustes')
  }

  const displayName = profile.full_name || user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Usuario'

  const activeMedication = useMemo(() => {
    const activeSlots = deviceData.compartments.filter((slot) => slot.active && Number(slot.amount) > 0)
    return activeSlots[0] || null
  }, [deviceData.compartments])

  if (authLoading) {
    return <AuthLoadingScreen />
  }

  if (!session || !user || authMode === 'recovery-password' || authMode === 'recovery-sent') {
    return (
      <LoginScreen
        authMode={authMode}
        authLoading={authLoading}
        authError={authError}
        authForm={authForm}
        setAuthForm={setAuthForm}
        setAuthMode={setAuthMode}
        onSubmit={handleAuthSubmit}
      />
    )
  }

  const updateForm = (slot, field, value) => {
    setFormData((current) => current.map((item) => {
      if (item.slot !== slot) return item

      const nextValue = field === 'amount'
        ? Math.max(0, Number(value) || 0)
        : field === 'frequencyHours'
          ? value === '' ? null : Number(value)
          : field === 'pillsPerDose'
            ? value === '' ? null : Number(value)
          : value
      const nextItem = { ...item, [field]: nextValue }

      if (field === 'medicationName' && nextValue && String(nextValue).trim() !== 'Sin asignar') {
        nextItem.active = true
      }

      if (field === 'active' && !nextValue) {
        nextItem.medicationName = 'Sin asignar'
        nextItem.dose = ''
        nextItem.doseUnit = 'mg'
        nextItem.frequencyHours = null
        nextItem.pillsPerDose = 1
        nextItem.startTime = ''
        nextItem.pillSize = null
        nextItem.amount = 0
      }

      return nextItem
    }))
  }

  const saveConfiguration = async () => {
    const sanitized = formData.map((item) => ({
      ...item,
      slot: Number(item.slot),
      medicationName: item.medicationName && item.medicationName.trim() ? item.medicationName.trim() : 'Sin asignar',
      dose: item.dose ? item.dose.trim() : '',
      doseUnit: item.doseUnit || 'mg',
      frequencyHours: item.frequencyHours === '' || item.frequencyHours == null ? null : Number(item.frequencyHours),
      pillsPerDose: Number(item.pillsPerDose || 1),
      startTime: item.startTime || '',
      pillSize: item.pillSize || '',
      amount: Math.max(0, Number(item.amount) || 0),
      rotation: getSlotAngle(item.slot),
      active: Boolean(Boolean(item.medicationName && item.medicationName.trim() && item.medicationName.trim() !== 'Sin asignar') || Number(item.amount) > 0),
    }))

    const configuredCompartments = sanitized.filter((item) => item.medicationName !== 'Sin asignar' || item.amount > 0)
    if (!configuredCompartments.length) {
      await notify('Agrega un medicamento y su cantidad.', 'Guía')
      return
    }
    if (configuredCompartments.some((item) => !isValidMedicationFrequencyHours(item.frequencyHours))) {
      await notify('El intervalo debe ser de 1 a 168 horas.', 'Guía')
      return
    }
    if (configuredCompartments.some((item) => !Number.isInteger(item.pillsPerDose) || item.pillsPerDose < 1 || item.pillsPerDose > 60)) {
      await notify('Indica de 1 a 60 pastillas por toma.', 'Guía')
      return
    }
    if (configuredCompartments.some((item) => !isValidMedicationDose(item.dose))) {
      await notify('La dosis debe ser un entero mayor que cero.', 'Guía')
      return
    }
    if (configuredCompartments.some((item) => !isValidMedicationStartTime(item.startTime))) {
      await notify('Indica una hora de inicio válida para cada medicamento.', 'Guía')
      return
    }
    if (configuredCompartments.some((item) => !['large', 'small', 'medium'].includes(item.pillSize))) {
      await notify('Selecciona el tamaño de pastilla para cada compartimento.', 'Guía')
      return
    }
    if (configuredCompartments.some((item) => !Number.isInteger(item.amount) || item.amount < 1 || item.amount > 60)) {
      await notify('Indica existencias de 1 a 60 pastillas para activar la agenda automática.', 'Guía')
      return
    }
    if (configuredCompartments.some((item) => item.amount < item.pillsPerDose)) {
      await notify('Las existencias deben cubrir al menos una toma completa.', 'Guía')
      return
    }

    const changedCompartments = configuredCompartments.filter((item) => {
      const previous = deviceData.compartments.find((compartment) => compartment.slot === item.slot)
      const hasHistoryEntry = (deviceData.dispenseEvents || []).some((event) => (
        Number(event.slot) === item.slot && event.medication_name === item.medicationName
      ))
      return !hasHistoryEntry || !previous
        || previous.medicationName !== item.medicationName
        || previous.dose !== item.dose
        || previous.doseUnit !== item.doseUnit
        || previous.frequencyHours !== item.frequencyHours
        || previous.pillsPerDose !== item.pillsPerDose
        || previous.startTime !== item.startTime
        || previous.pillSize !== item.pillSize
        || Number(previous.amount) !== Number(item.amount)
        || Boolean(previous.active) !== Boolean(item.active)
    })

    const response = await upsertCompartments(configuredCompartments, user.id)
    if (response.success) {
      const eventResults = await Promise.all(changedCompartments.map((item) => sendDispenseEvent({
        slot: item.slot,
        medicationName: item.medicationName,
        message: (() => {
          const previous = deviceData.compartments.find((compartment) => compartment.slot === item.slot)
          if (previous?.medicationName === 'Sin asignar') return 'Medicamento añadido al compartimento'
          if (!previous || previous.medicationName !== item.medicationName || previous.dose !== item.dose || previous.doseUnit !== item.doseUnit || previous.frequencyHours !== item.frequencyHours || previous.pillsPerDose !== item.pillsPerDose || previous.startTime !== item.startTime || previous.pillSize !== item.pillSize || Number(previous.amount) !== Number(item.amount)) {
            return 'Configuración del medicamento actualizada'
          }
          return 'Configuración registrada en Historial'
        })(),
        userId: user.id,
      })))
      const recordedEvents = eventResults.filter((result) => result.success && result.data).map((result) => result.data)

      setDeviceData((prev) => ({
        ...prev,
        compartments: sanitized,
        dispenseEvents: [...recordedEvents, ...(prev.dispenseEvents || [])].slice(0, 20),
        connected: false,
      }))
      await upsertDeviceSettings({
        ...deviceData.device,
        name: deviceData.device.name || 'Mi dispensador',
        connectionStatus: deviceData.device.connectionStatus || 'Sin configurar',
      }, user.id)
      const eventsFailed = eventResults.some((result) => !result.success)
      const scheduleMessage = ' Para activar o actualizar la agenda, conecta el ESP32, sincroniza el RTC y pulsa «Sincronizar agenda automática».'
      await notify(
        eventsFailed
          ? `Medicamento guardado, pero no se pudo registrar en el historial. Revisa la migración SQL de Supabase.${scheduleMessage}`
          : changedCompartments.length
            ? `Medicamento guardado y registrado en Historial.${scheduleMessage}`
            : `Configuración guardada; no hubo cambios para registrar.${scheduleMessage}`,
        'DIM',
      )
    } else {
      const saveError = response.error
      const errorCode = saveError?.code ? ` (${saveError.code})` : ''
      const errorMessage = saveError?.message || 'Supabase no devolvió detalles del error.'
      const missingPillSize = saveError?.code === 'PGRST204'
        && saveError?.message?.includes("'pill_size'")
      const migrationHint = missingPillSize
        ? ' En Supabase, ejecuta database/migrate_medication_pill_size.sql en el proyecto correcto. Esa migración agrega la columna y solicita recargar la caché de PostgREST. Después recarga la app.'
        : ['PGRST204', '42703'].includes(saveError?.code)
          ? ' Revisa que estén aplicadas todas las migraciones requeridas en el proyecto correcto y recarga la caché del esquema de Supabase.'
        : saveError?.code === '42501'
          ? ' Revisa la migración de alcance por usuario y las políticas RLS de dispenser_compartments.'
          : ''
      await notify(`No se pudo guardar en Supabase${errorCode}: ${errorMessage}.${migrationHint}`, 'DIM')
    }
  }

  const recordHardwareDispense = async (slotNumber, pillsDispensed) => {
    const compartment = deviceData.compartments.find((item) => Number(item.slot) === slotNumber)
    if (!user || !compartment || !Number.isInteger(pillsDispensed) || pillsDispensed < 1
        || Number(compartment.amount) < pillsDispensed) {
      return 'El ciclo terminó, pero no se pudo actualizar el inventario local.'
    }

    const updated = { ...compartment, amount: Number(compartment.amount) - pillsDispensed }
    setFormData((current) => current.map((item) => item.slot === slotNumber ? updated : item))
    setDeviceData((current) => ({
      ...current,
      compartments: current.compartments.map((item) => item.slot === slotNumber ? updated : item),
    }))

    try {
      const [inventoryResult, eventResult] = await Promise.all([
        upsertCompartments([updated], user.id),
        sendDispenseEvent({
          slot: slotNumber,
          medicationName: compartment.medicationName,
          message: `${pillsDispensed} pastilla(s) dispensada(s) desde el control local`,
          userId: user.id,
        }),
      ])
      if (eventResult.success && eventResult.data) {
        setDeviceData((current) => ({
          ...current,
          dispenseEvents: [eventResult.data, ...(current.dispenseEvents || [])].slice(0, 20),
        }))
      }
      return inventoryResult.success && eventResult.success
        ? `Toma dispensada (${pillsDispensed} pastilla(s)). Quedan ${updated.amount} pastillas.`
        : 'El dispositivo completó el ciclo, pero falló la sincronización del inventario o historial.'
    } catch (error) {
      console.error('No se pudo sincronizar la dispensación:', error)
      return 'El dispositivo completó el ciclo, pero no se pudo sincronizar el inventario.'
    }
  }

  const syncHardwareInventory = async (hardwareStatus) => {
    if (!Array.isArray(hardwareStatus.schedules)) return
    const hardwareSchedules = hardwareStatus.schedules.filter((item) => item.enabled)
    if (hardwareSchedules.some((item) => !Number.isInteger(Number(item.remaining)) || Number(item.remaining) < 0 || Number(item.remaining) > 60)) {
      throw new Error('El ESP32 devolvió un inventario inválido; no se actualizó Supabase.')
    }
    if (inventorySyncInProgressRef.current) return
    inventorySyncInProgressRef.current = true
    try {
      const remainingBySlot = new Map(hardwareSchedules
        .map((item) => [Number(item.compartment), Number(item.remaining)]))
      const currentCompartments = compartmentsRef.current
      const updated = currentCompartments.map((item) => (
        remainingBySlot.has(Number(item.slot))
          ? { ...item, amount: remainingBySlot.get(Number(item.slot)) }
          : item
      ))
      const changed = updated.filter((item) => (
        Number(item.amount) !== Number(currentCompartments.find((previous) => previous.slot === item.slot)?.amount)
      ))
      if (!changed.length) return

      const result = await upsertCompartments(changed, user.id)
      if (!result.success) throw new Error('El ESP32 reportó un nuevo stock, pero no se pudo actualizar Supabase.')
      compartmentsRef.current = updated
      setFormData((current) => current.map((item) => {
        const hardwareItem = updated.find((entry) => entry.slot === item.slot)
        return hardwareItem ? { ...item, amount: hardwareItem.amount } : item
      }))
      setDeviceData((current) => ({ ...current, compartments: updated }))
    } finally {
      inventorySyncInProgressRef.current = false
    }
  }

  const renderView = () => {
    if (active === 'home') return <HomeView data={deviceData} activeMedication={activeMedication} displayName={displayName} notify={notify} onNavigate={setActive} onMedicationDetail={(medication) => setModal({ type: 'medication', medication })} onOpenGuide={setModal} loading={loading} />
    if (active === 'treatments') return <TreatmentsView data={deviceData} onNavigate={setActive} />
    if (active === 'dispenser') return (
      <DispenserView
        data={deviceData}
        formData={formData}
        updateForm={updateForm}
        saveConfiguration={saveConfiguration}
        loading={loading}
        notify={notify}
        onOpenGuide={setModal}
        setDeviceData={setDeviceData}
        onDispenseSuccess={recordHardwareDispense}
        onHardwareStatus={syncHardwareInventory}
      />
    )
    if (active === 'history') return <HistoryView events={deviceData.dispenseEvents || []} onNavigate={setActive} />
    return <SettingsView device={deviceData.device} profile={profile} profileSaving={profileSaving} deviceSettingsSaving={deviceSettingsSaving} onSaveProfile={saveProfile} onSaveNightWindow={saveNightWindow} onOpenGuide={setModal} />
  }

  return (
    <div className="app-shell">
      <aside className="desktop-rail">
        <div className="brand"><div className="brand-mark"><HeartPulse size={20} /></div><span>DIM</span></div>
        <p className="rail-kicker">Mi ecosistema</p>
        <nav>{navItems.map(({ id, label, icon: Icon }) => <button key={id} className={active === id ? 'rail-link active' : 'rail-link'} onClick={() => setActive(id)}><Icon size={19} />{label}</button>)}</nav>
        <div className="rail-footer"><div className="avatar">{displayName.slice(0, 2).toUpperCase()}</div><div><strong>{displayName}</strong><small>{profile.email || user?.email || 'Perfil principal'}</small></div><button className="logout-button" onClick={handleSignOut} aria-label="Cerrar sesión"><X size={14} /></button></div>
      </aside>
      <main className="main-content">
        <header className="topbar"><div className="mobile-brand"><div className="brand-mark"><HeartPulse size={18} /></div><span>DIM</span></div><div className="connection"><span className="online-dot" /> {deviceData.connected ? 'Dispensador conectado' : 'Dispensador sin conexión'} <strong>{deviceData.connected ? '100%' : 'Offline'}</strong><Wifi size={15} /></div><button className="icon-button" aria-label="Notificaciones" onClick={() => notify('No tienes alertas nuevas', 'DIM')}><Bell size={20} /><i /></button></header>
        <div className="page-content">{dataLoadError && <div className="supabase-warning" role="status"><AlertTriangle size={18} /><span>No se pudo cargar la configuración de Supabase: {dataLoadError}</span></div>}{renderView()}</div>
      </main>
      <nav className="bottom-nav">{navItems.map(({ id, label, icon: Icon }) => <button key={id} className={active === id ? 'bottom-link active' : 'bottom-link'} onClick={() => setActive(id)}><Icon size={20} /><span>{label}</span></button>)}</nav>
      {modal && <Modal type={typeof modal === 'string' ? modal : modal.type} medication={typeof modal === 'string' ? null : modal.medication} close={() => setModal(null)} onConfirm={() => { const type = typeof modal === 'string' ? modal : modal.type; setModal(null); if (type === 'setup-guide' || type === 'network-guide' || type === 'voice-guide') setActive('dispenser'); else if (type === 'travel' || type === 'refill' || type === 'ocr') notify(type === 'travel' ? 'Modo viaje configurado' : type === 'refill' ? 'Guía de recarga iniciada' : 'Abriendo cámara', 'DIM') }} />}
      {toast && <div className="toast" role="status"><Check size={17} /><span>{toast}</span><button type="button" className="toast-close" aria-label="Cerrar mensaje" onClick={() => setToast('')}><X size={18} /></button></div>}
    </div>
  )
}

function AuthLoadingScreen() {
  return (
    <div className="auth-loader-shell">
      <div className="auth-loader-card">
        <div className="brand-mark"><HeartPulse size={20} /></div>
        <p className="eyebrow">DIM</p>
        <h2>Cargando dispensador...</h2>
      </div>
    </div>
  )
}

function LoginScreen({ authMode, authLoading, authError, authForm, setAuthForm, setAuthMode, onSubmit }) {
  const isLogin = authMode === 'login'
  const isSignup = authMode === 'signup'
  const isRecoveryPassword = authMode === 'recovery-password'
  const isRecoverySent = authMode === 'recovery-sent'
  const isRecovery = authMode === 'recovery' || isRecoveryPassword || isRecoverySent
  const title = isSignup ? 'Crear cuenta' : isRecoveryPassword ? 'Cambia tu contraseña' : isRecoverySent ? 'Revisa tu correo' : isRecovery ? 'Recuperar contraseña' : 'Entrar'

  return (
    <div className="login-shell">
      <div className="login-card">
        <div className="login-panel left-panel">
          <div className="brand"><div className="brand-mark"><HeartPulse size={20} /></div><span>DIM</span></div>
          <h1>Tu dispensador, fácil de usar</h1>
        </div>

        <div className="login-panel right-panel">
          <h2>{title}</h2>

          <form className="auth-form" onSubmit={onSubmit}>
            {authError && <p className="auth-error" role="alert">{authError}</p>}
            {isSignup && (
              <label className="auth-input-wrap">
                <span>Nombre completo</span>
                <input
                  type="text"
                  value={authForm.fullName}
                  onChange={(event) => setAuthForm((current) => ({ ...current, fullName: event.target.value }))}
                  autoComplete="name"
                  required
                />
              </label>
            )}

            {(isLogin || isSignup || authMode === 'recovery') && (
              <label className="auth-input-wrap">
                <span>Correo electrónico</span>
                <input
                  type="email"
                  value={authForm.email}
                  onChange={(event) => setAuthForm((current) => ({ ...current, email: event.target.value }))}
                  autoComplete="email"
                  required
                />
              </label>
            )}

            {(isLogin || isSignup || isRecoveryPassword) && (
              <label className="auth-input-wrap">
                <span>{isRecoveryPassword ? 'Nueva contraseña' : 'Contraseña'}</span>
                <input
                  type="password"
                  value={authForm.password}
                  onChange={(event) => setAuthForm((current) => ({ ...current, password: event.target.value }))}
                  autoComplete={isRecoveryPassword ? 'new-password' : isLogin ? 'current-password' : 'new-password'}
                  minLength={6}
                  required
                />
              </label>
            )}

            {isRecovery && <p className="auth-help">{isRecoverySent ? 'Si el correo está registrado, enviaremos un enlace para cambiar la contraseña.' : isRecoveryPassword ? 'Elige una contraseña nueva para tu cuenta.' : 'Te enviaremos un enlace para cambiar tu contraseña.'}</p>}

            {!isRecoverySent && <button className="primary-button full" type="submit" disabled={authLoading}>
              {authLoading ? 'Espera…' : isLogin ? 'Entrar' : isSignup ? 'Crear cuenta' : isRecoveryPassword ? 'Guardar contraseña' : 'Enviar enlace'}
            </button>}
          </form>

          {isLogin && <div className="login-toggle-row"><button type="button" className="text-button" onClick={() => setAuthMode('recovery')}>Olvidé mi contraseña</button></div>}
          {(isLogin || isSignup) && <div className="login-toggle-row"><button type="button" className="text-button" onClick={() => setAuthMode(isLogin ? 'signup' : 'login')}>{isLogin ? 'Crear cuenta' : 'Ya tengo cuenta'}</button></div>}
          {isRecovery && <div className="login-toggle-row"><button type="button" className="text-button" onClick={() => { setAuthMode('login'); setAuthForm((current) => ({ ...current, password: '' })) }}>Volver a entrar</button></div>}
        </div>
      </div>
    </div>
  )
}

function PageHeading({ eyebrow, title, action, onAction }) {
  return (
    <div className="page-heading">
      <div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1></div>
      {action && <button className="outline-button" onClick={onAction}>{action.icon && <action.icon size={16} />}{action.label}</button>}
    </div>
  )
}

function StatusPill({ children, tone = 'neutral' }) {
  return <span className={`status-pill ${tone}`}><span className="status-dot" />{children}</span>
}

function PillVisual({ color = 'blue', size = 'normal' }) {
  return <span className={`pill-visual ${color} ${size}`}><span /></span>
}

function HomeView({ data, activeMedication, displayName, notify, onNavigate, onMedicationDetail, onOpenGuide, loading }) {
  const scheduled = data.compartments.filter((slot) => slot.active && Number(slot.amount) > 0).slice(0, 3)
  const rows = scheduled.map((slot) => ({
    time: slot.frequencyHours ? String(slot.frequencyHours) : '--',
    period: slot.frequencyHours ? 'h · cada' : 'sin intervalo',
    name: slot.medicationName,
    medication: slot,
    dose: slot.dose ? `${slot.dose} ${slot.doseUnit || 'mg'}` : 'Dosis personalizable',
    detail: `${slot.pillsPerDose || 1} pastilla(s) por toma`,
    status: Number(slot.amount) > 0 ? 'next' : 'taken',
    cart: `${String(slot.slot).padStart(2, '0')}`,
    color: slot.slot % 2 === 0 ? 'blue' : 'red',
    stamp: `${slot.frequencyHours ? `Cada ${slot.frequencyHours} horas` : 'Frecuencia sin configurar'} · ${slot.amount} disponibles`,
  }))

  const currentHour = new Date().getHours()
  const nightBlocked = isRestrictedNightWindow(new Date(), data.device.nightStart, data.device.nightEnd)
  const hasMedication = data.compartments.some((slot) => slot.active && slot.medicationName !== 'Sin asignar')

  useEffect(() => {
    if (loading || hasMedication || sessionStorage.getItem('dim-home-guide-shown')) return
    sessionStorage.setItem('dim-home-guide-shown', 'true')
    onOpenGuide('setup-guide')
  }, [hasMedication, loading, onOpenGuide])

  return (
    <>
      <PageHeading eyebrow="Miércoles, 10 de septiembre" title={`Buenos días, ${displayName}`} action={{ label: 'Modo viaje', icon: Zap }} onAction={() => onOpenGuide('travel')} />
      <section className="hardware-strip"><div className="hardware-copy"><span className="live-label"><span className="live-dot" /> {data.connected ? 'EN VIVO' : 'INICIO'}</span><strong>{nightBlocked ? 'Horario configurado: dispensación bloqueada' : hasMedication ? 'Tu plan está preparado' : 'Tu espacio está listo para configurar'}</strong><small>{nightBlocked ? `Bloqueo activo de ${data.device.nightStart} a ${data.device.nightEnd}` : hasMedication ? `Última sincronización: ${currentHour}:00` : 'Añade tus medicamentos para empezar'}</small></div><div className="hardware-stats"><span><Wifi size={17} /> {data.device.wifiName || 'Wi-Fi sin configurar'}</span><span><Zap size={17} /> {data.connected ? 'Conectado' : 'Sin conectar'}</span></div></section>
      {!hasMedication && <GettingStarted onOpenGuide={() => onOpenGuide('setup-guide')} />}
      <section className="next-dose-card"><div className="next-dose-top"><div><p className="eyebrow light">{activeMedication ? 'INTERVALO CONFIGURADO' : 'PRÓXIMA TOMA'} <span className="countdown">{activeMedication ? `CADA ${activeMedication.frequencyHours || '?'} H` : 'SIN PROGRAMAR'}</span></p><h2>{activeMedication ? activeMedication.medicationName.split(' ')[0] || 'Medicamento' : 'Sin' } <span>{activeMedication ? (activeMedication.dose ? `${activeMedication.dose} ${activeMedication.doseUnit || 'mg'}` : 'configurado') : 'programación'}</span></h2><p className="dose-location"><span className="mini-led blue" /> Compartimento <b>#{String(activeMedication?.slot || 1).padStart(2, '0')}</b> · {activeMedication ? 'Activo' : 'Vacío'}</p></div><div className="dose-illustration"><PillVisual color="blue" size="large" /><PillVisual color="white" size="large" /></div></div><div className="dose-info"><div><strong>{activeMedication ? activeMedication.medicationName : 'Sin medicamento'}</strong><span>{activeMedication ? `${activeMedication.pillsPerDose || 1} pastilla(s) por toma · ${activeMedication.amount} disponibles · inicia ${activeMedication.startTime || 'sin hora'}` : 'Configurar en dispensador'}</span></div></div></section>
      <section className="section-block"><div className="section-title"><div><p className="eyebrow">TU PROGRESO</p><h2>Agenda de hoy</h2></div><span className="progress-count">{rows.length} <small>tomas</small></span></div>{rows.length > 0 ? <><div className="progress-track"><span /></div><div className="timeline">{rows.map((dose, index) => <DoseRow key={`${dose.cart}-${dose.name}-${index}`} dose={dose} last={index === rows.length - 1} onAction={() => onMedicationDetail(dose.medication)} />)}</div></> : <p className="empty-inline">Tu agenda aparecerá aquí cuando configures un medicamento.</p>}</section>
    </>
  )
}

function DoseRow({ dose, last, onAction }) {
  return <div className={`dose-row ${dose.status}`}><div className="time-col"><strong>{dose.time}</strong><span>{dose.period}</span></div><div className="timeline-line"><span className={`timeline-dot ${dose.status}`} />{!last && <i />}</div><div className="dose-main"><div className="dose-title"><div><strong>{dose.name}</strong><span>{dose.dose} · {dose.detail}</span></div>{dose.status === 'taken' ? <StatusPill tone="success">Completada</StatusPill> : <StatusPill tone="warning">Pendiente</StatusPill>}</div><div className="dose-meta"><span className={`mini-led ${dose.color}`} /> Cartucho #{dose.cart} <span className="meta-separator" /> {dose.stamp}</div>{dose.status === 'next' && <button className="text-button" onClick={onAction}>Ver detalle <ChevronRight size={15} /></button>}</div></div>
}

function TreatmentsView({ data, onNavigate }) {
  const medications = data.compartments.filter((slot) => slot.active && slot.medicationName !== 'Sin asignar')

  return <>  <PageHeading eyebrow="Módulo 02" title="Tratamientos" action={{ label: 'Añadir medicamento', icon: Plus }} onAction={() => onNavigate('dispenser')} />{medications.length ? <><div className="section-title compact"><div><p className="eyebrow">PLAN ACTIVO</p><h2>Medicamentos programados</h2></div></div>{medications.map((slot) => <div className="medication-list-item" key={slot.slot}><PillVisual color={slot.slot % 2 === 0 ? 'blue' : 'red'} /><span><strong>{slot.medicationName}</strong><small>{slot.dose ? `${slot.dose} ${slot.doseUnit || 'mg'}` : 'Dosis sin especificar'} · {slot.pillsPerDose || 1} pastilla(s) por toma · Desde {slot.startTime || 'sin hora'} · Cada {slot.frequencyHours || '?'} horas · Compartimento {String(slot.slot).padStart(2, '0')}</small></span><span className="med-time">{slot.amount} disponibles</span></div>)}</> : <EmptyGuide eyebrow="SIN TRATAMIENTOS" title="Aún no hay medicamentos" description="Añade uno desde Mi dispensador." action="Ir al dispensador" onAction={() => onNavigate('dispenser')} />}</>
}

function GettingStarted({ onOpenGuide }) {
  return <section className="getting-started"><div className="getting-started-heading"><p className="eyebrow">PRIMER PASO</p><h2>Configura un medicamento</h2><p>Elige un compartimento y guarda sus datos.</p></div><button className="primary-button" onClick={onOpenGuide}>Ver guía <ChevronRight size={16} /></button></section>
}

function EmptyGuide({ eyebrow, title, description, action, onAction }) {
  return <section className="empty-guide"><p className="eyebrow">{eyebrow}</p><h2>{title}</h2><p>{description}</p>{action && <button className="outline-button" onClick={onAction}>{action} <ChevronRight size={16} /></button>}</section>
}

function DispenserView({ data, formData, updateForm, saveConfiguration, loading, notify, onOpenGuide, setDeviceData, onDispenseSuccess, onHardwareStatus }) {
  const [selectedSlot, setSelectedSlot] = useState(1)
  const configurationRef = useRef(null)
  const totalStock = data.compartments.reduce((sum, item) => sum + Number(item.amount || 0), 0)
  const activeCount = data.compartments.filter((item) => item.active && Number(item.amount) > 0).length
  const blocked = isRestrictedNightWindow(new Date(), data.device.nightStart, data.device.nightEnd)
  const selectedCompartment = formData.find((item) => item.slot === selectedSlot) || formData[0]
  const selectCompartment = (slot) => {
    setSelectedSlot(slot)
    requestAnimationFrame(() => configurationRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  return (
    <>
      <PageHeading eyebrow="Módulo 03" title="Mi dispensador" action={{ label: 'Guía de recarga', icon: Lightbulb }} onAction={() => onOpenGuide('refill')} />
      {!formData.some((item) => item.active && item.medicationName !== 'Sin asignar') && <div className="dispenser-hint"><Lightbulb size={18} /><div><strong>¿Necesitas ayuda?</strong><p>Guarda medicamento, dosis e inventario en un compartimento.</p></div><button type="button" className="text-button" onClick={() => onOpenGuide('setup-guide')}>Ver guía</button></div>}
      <section className="dispenser-overview">
        <div className="device-stage">
          <div className="device-ring">
            {Array.from({ length: 7 }, (_, index) => {
              const slot = index + 1
              const item = data.compartments.find((compartment) => compartment.slot === slot) || buildDefaultCompartment(slot)
              const isActive = Boolean(item.active && item.medicationName && item.medicationName !== 'Sin asignar')
              const isSelected = item.slot === selectedSlot

              return (
                <button
                  key={item.slot}
                  type="button"
                  className={`compartment c${item.slot} ${isActive ? 'active' : 'inactive'} ${isSelected ? 'selected' : ''}`}
                  onClick={() => selectCompartment(item.slot)}
                  aria-label={`Seleccionar compartimento ${item.slot}`}
                >
                  <span>{String(item.slot).padStart(2, '0')}</span>
                </button>
              )
            })}
            <div className="device-center"><HeartPulse size={21} /><small>DIM</small></div>
          </div>
          <span className="device-caption"><span className="live-dot" /> {blocked ? `Bloqueado de ${data.device.nightStart} a ${data.device.nightEnd}` : data.connected ? 'Dispensador conectado' : 'Dispensador sin conectar'}</span>
        </div>
        <div className="stock-summary">
          <p className="eyebrow">ESTADO DEL STOCK</p>
          <strong>{Math.min(100, Math.round((totalStock / 80) * 100))}%</strong>
          <div className="progress-track"><span /></div>
          <small>{totalStock} de 80 pastillas disponibles</small>
          <StatusPill tone={activeCount > 0 ? 'success' : 'warning'}>{activeCount} compartimentos activos</StatusPill>
        </div>
      </section>

      <div className="section-title compact"><div><p className="eyebrow">CONFIGURACIÓN</p><h2>Compartimentos del dispensador</h2></div></div>
      <div className="compound-selector">
        {formData.map((item) => {
          const isActive = Boolean(item.active && item.medicationName && item.medicationName !== 'Sin asignar')
          const isSelected = item.slot === selectedSlot

          return (
            <button
              key={item.slot}
              type="button"
              className={`slot-option ${isSelected ? 'selected' : ''} ${isActive ? 'active' : 'inactive'}`}
              onClick={() => selectCompartment(item.slot)}
            >
              {String(item.slot).padStart(2, '0')}
            </button>
          )
        })}
      </div>

      {selectedCompartment && (
        <div className="compartment-config-grid">
          <div className="config-card selected-config-card" key={selectedCompartment.slot} ref={configurationRef}>
            <div className="config-card-header">
              <span>Compartimento {String(selectedCompartment.slot).padStart(2, '0')}</span>
              <span className="config-angle">{getSlotAngle(selectedCompartment.slot)}°</span>
            </div>
            <label>
              <span>Medicamento</span>
              <input
                type="text"
                value={selectedCompartment.medicationName}
                onChange={(event) => updateForm(selectedCompartment.slot, 'medicationName', event.target.value)}
                placeholder="Ej. Metformina"
              />
            </label>
            <label>
              <span>Dosis</span>
              <div className="dose-input-group">
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={selectedCompartment.dose}
                  onChange={(event) => updateForm(selectedCompartment.slot, 'dose', event.target.value)}
                  placeholder="Ej. 850"
                  required
                />
                <select
                  aria-label="Unidad de medida de la dosis"
                  value={selectedCompartment.doseUnit || 'mg'}
                  onChange={(event) => updateForm(selectedCompartment.slot, 'doseUnit', event.target.value)}
                >
                  <option value="mg">mg</option>
                  <option value="µg">µg</option>
                  <option value="g">g</option>
                  <option value="UI">UI</option>
                </select>
              </div>
            </label>
            <label>
              <span>Hora de inicio</span>
              <input
                type="time"
                value={selectedCompartment.startTime || ''}
                onChange={(event) => updateForm(selectedCompartment.slot, 'startTime', event.target.value)}
                required
              />
              <small>La primera entrega será a esta hora; después se repetirá según el intervalo.</small>
            </label>
            <label>
              <span>¿Cada cuántas horas debe tomarse?</span>
              <input
                type="number"
                min="1"
                max="168"
                step="1"
                value={selectedCompartment.frequencyHours ?? ''}
                onChange={(event) => updateForm(selectedCompartment.slot, 'frequencyHours', event.target.value)}
                placeholder="Ej. 8"
                required
              />
              <small>Usa el intervalo indicado por el profesional de salud (1–168 horas).</small>
            </label>
            <label>
              <span>Pastillas de este medicamento por toma</span>
              <input
                type="number"
                min="1"
                max="60"
                step="1"
                value={selectedCompartment.pillsPerDose ?? 1}
                onChange={(event) => updateForm(selectedCompartment.slot, 'pillsPerDose', event.target.value)}
                required
              />
              <small>Se dispensará esta cantidad en cada horario programado.</small>
            </label>
            <label>
              <span>Tamaño de la pastilla</span>
              <select
                value={selectedCompartment.pillSize ?? ''}
                onChange={(event) => updateForm(selectedCompartment.slot, 'pillSize', event.target.value)}
                required
              >
                <option value="">Selecciona el tamaño</option>
                <option value="large">Grande</option>
                <option value="small">Pequeña</option>
                <option value="medium">Mediana</option>
              </select>
              <small>El disco singularizador ajustará su posición automáticamente.</small>
            </label>
            <label>
              <span>Cantidad de pastillas</span>
              <input
                type="number"
                min="0"
                max="60"
                value={selectedCompartment.amount}
                onChange={(event) => updateForm(selectedCompartment.slot, 'amount', event.target.value)}
              />
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={Boolean(selectedCompartment.active && selectedCompartment.medicationName && selectedCompartment.medicationName !== 'Sin asignar')}
                onChange={(event) => updateForm(selectedCompartment.slot, 'active', event.target.checked)}
              />
              <span>Compartimento activo</span>
            </label>
          </div>
        </div>
      )}

      <div className="config-actions">
        <button className="primary-button full" onClick={saveConfiguration} disabled={loading}>
          {loading ? 'Sincronizando...' : 'Guardar configuración'}
        </button>
      </div>
      <DeviceControlPanel compartments={data.compartments} selectedSlot={selectedSlot} blocked={blocked} notify={notify} setDeviceData={setDeviceData} onDispenseSuccess={onDispenseSuccess} onHardwareStatus={onHardwareStatus} />
    </>
  )
}

function DeviceControlPanel({ compartments, selectedSlot, blocked, notify, setDeviceData, onDispenseSuccess, onHardwareStatus }) {
  const [deviceUrl, setDeviceUrl] = useState(getInitialDeviceUrl)
  const [deviceKey, setDeviceKey] = useState(() => window.localStorage.getItem('dim-device-key') || '')
  const [savedUrl, setSavedUrl] = useState('')
  const [physicalCompartment, setPhysicalCompartment] = useState(1)
  const [oneTimeCompartment, setOneTimeCompartment] = useState(selectedSlot)
  const [oneTimeMinutes, setOneTimeMinutes] = useState(5)
  const [audioTrack, setAudioTrack] = useState(1)
  const [audioVolume, setAudioVolume] = useState(18)
  const [hardware, setHardware] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!savedUrl || busy) return undefined

    let isMounted = true
    const refresh = async () => {
      try {
        const status = await deviceApi.status(savedUrl, deviceKey)
        if (isMounted) {
          setHardware(status)
          setDeviceData((current) => ({ ...current, connected: Boolean(status.connected) }))
          await onHardwareStatus(status)
          setError('')
        }
      } catch (requestError) {
        if (isMounted) {
          setError(requestError.message)
          setDeviceData((current) => ({ ...current, connected: false }))
        }
      }
    }

    refresh()
    const interval = window.setInterval(refresh, 3000)
    return () => {
      isMounted = false
      window.clearInterval(interval)
    }
  }, [savedUrl, deviceKey, busy])

  useEffect(() => {
    if (!savedUrl || !hardware?.connected || busy) return undefined
    let isMounted = true
    deviceApi.indicateCompartment(savedUrl, selectedSlot, deviceKey).catch((requestError) => {
      if (isMounted) setError(requestError.message)
    })
    return () => {
      isMounted = false
    }
  }, [savedUrl, deviceKey, selectedSlot, hardware?.connected, busy])

  const connect = async (event) => {
    event.preventDefault()
    try {
      const normalizedUrl = normalizeDeviceUrl(deviceUrl)
      const normalizedKey = deviceKey.trim()
      if (!normalizedKey) throw new Error('Introduce la clave local configurada en el firmware')
      const status = await deviceApi.status(normalizedUrl, normalizedKey)
      window.localStorage.setItem('dim-device-url', normalizedUrl)
      window.localStorage.setItem('dim-device-key', normalizedKey)
      setDeviceUrl(normalizedUrl)
      setDeviceKey(normalizedKey)
      setSavedUrl(normalizedUrl)
      setHardware(status)
      setDeviceData((current) => ({ ...current, connected: Boolean(status.connected) }))
      await onHardwareStatus(status)
      setError('')
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  const run = async (action, successMessage, onSuccess) => {
    if (!savedUrl) return setError('Conecta el dispensador antes de enviar comandos.')
    setBusy(true)
    setError('')
    try {
      const result = await action(savedUrl, deviceKey)
      if (onSuccess && !result.completed) throw new Error('El dispositivo no confirmó el ciclo de dispensación.')
      const baseMessage = onSuccess ? await onSuccess(result) : successMessage
      const message = result.scheduleStateSaved === false
        ? `${baseMessage} El ESP32 no pudo guardar el saldo; revisa la agenda antes del siguiente ciclo.`
        : baseMessage
      try {
        const status = await deviceApi.status(savedUrl, deviceKey)
        setHardware(status)
        setDeviceData((current) => ({ ...current, connected: Boolean(status.connected) }))
        await onHardwareStatus(status)
      } catch (statusError) {
        setError(statusError.message)
        setDeviceData((current) => ({ ...current, connected: false }))
      }
      await notify(message, 'Dispensador')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setBusy(false)
    }
  }

  const connected = Boolean(hardware?.connected)
  const sensors = hardware?.sensors || {}
  const clock = hardware?.clock || {}
  const scheduleFaultCount = (hardware?.schedules || []).filter((item) => item.faulted).length
  const physicalItem = compartments.find((item) => Number(item.slot) === physicalCompartment)
  const physicalPillsPerDose = Number(physicalItem?.pillsPerDose || 1)
  const physicalItemAvailable = Boolean(physicalItem?.active && Number(physicalItem.amount) >= physicalPillsPerDose
      && physicalItem.medicationName && physicalItem.medicationName !== 'Sin asignar')
  const oneTimeItem = compartments.find((item) => Number(item.slot) === oneTimeCompartment)
  const oneTimePillsPerDose = Number(oneTimeItem?.pillsPerDose || 1)
  const oneTimeItemAvailable = Boolean(oneTimeItem?.active && Number(oneTimeItem.amount) >= oneTimePillsPerDose
      && oneTimeItem.medicationName && oneTimeItem.medicationName !== 'Sin asignar')
  const oneTimePending = Boolean(hardware?.oneTimeSchedule?.enabled)
  const oneTimeSlotSynced = Boolean(hardware?.schedules?.some(
    (item) => Number(item.compartment) === oneTimeCompartment && item.enabled && !item.faulted,
  ))
  const firmwareGeneration = Number(/DIM-ESP32S3-(\d+)/.exec(hardware?.firmwareVersion || '')?.[1] || 0)
  const supportsOneTimeSchedule = firmwareGeneration >= 6
  const oneTimeBlockReason = !connected
    ? 'Conecta el ESP32 antes de programar o borrar su agenda.'
    : !hardware?.carouselHomed || !hardware?.feederHomed
      ? 'El carrusel y el disco deben encontrar HOME. Revisa el estado del hardware y vuelve a referenciarlos.'
    : hardware?.scheduleClockAligned === false
      ? 'La hora cambió, pero no se guardó el recálculo de la agenda. Vuelve a sincronizar el RTC y la agenda.'
    : busy
      ? 'Hay un comando en curso; espera a que termine.'
      : oneTimePending
        ? 'Ya hay una toma única pendiente. Cancélala antes de programar otra o modificar/borrar la agenda.'
        : !supportsOneTimeSchedule
          ? 'La toma única en minutos requiere firmware DIM-ESP32S3-6 o posterior. Actualízalo tú por OTA o USB y vuelve a consultar el estado.'
          : !clock.valid
            ? 'El RTC no está validado. Sincroniza el reloj del dispositivo.'
            : !oneTimeSlotSynced
              ? 'El compartimento elegido no está instalado en la agenda del ESP32. Guarda la configuración y sincroniza la agenda automática.'
              : !oneTimeItemAvailable
                ? 'El compartimento elegido no tiene medicamento configurado o no tiene saldo suficiente.'
                : ''

  return (
    <section className="device-control-panel">
      <div className="device-control-heading">
        <div><p className="eyebrow">CONTROL LOCAL</p><h2>Hardware del dispensador</h2></div>
        <span className={`device-status ${connected ? 'is-connected' : ''}`}><i />{connected ? 'Conectado' : 'Sin conexión'}</span>
      </div>
      <form className="device-connect-form" onSubmit={connect}>
        <label htmlFor="device-address">Dirección local del ESP32</label>
        <div><input id="device-address" value={deviceUrl} onChange={(event) => setDeviceUrl(event.target.value)} placeholder="192.168.4.1 (AP) o IP de tu red" autoComplete="url" /><button className="outline-button" type="submit">Conectar</button></div>
        <label htmlFor="device-key">Clave local del dispositivo</label>
        <input id="device-key" type="password" value={deviceKey} onChange={(event) => setDeviceKey(event.target.value)} autoComplete="current-password" />
        <small className="hardware-note">Conéctate al Wi‑Fi del ESP32 o a la misma red del dispensador. La primera conexión valida la dirección y la clave.</small>
      </form>
      {error && <p className="device-error" role="status">{error}</p>}
      {hardware && (
        <div className="hardware-readout">
          <span><strong>Firmware</strong><small>{hardware.firmwareVersion || 'Versión anterior: actualiza el firmware para habilitar todos los controles'}</small></span>
          <span><strong>Hotspot del iPhone</strong><small>{hardware.stationConnected ? `Conectado · ${hardware.stationIp || 'IP sin informar'}` : 'ESP32 aún no aparece como cliente del hotspot'}</small></span>
          <span><strong>Wi‑Fi directo del ESP32</strong><small>{hardware.accessPointIp || 'No disponible'} · SSID Dispensador</small></span>
          <span><strong>Nombre local</strong><small>{hardware.hostName || 'Disponible al actualizar el firmware'}</small></span>
          <span><strong>Carrusel</strong><small>{hardware.carouselHomed ? `Referencia lista · posición ${hardware.carouselPosition ?? '-'}` : 'Sin referenciar'}</small></span>
          <span><strong>Receptor</strong><small>{hardware.feederHomed ? `HOME detectado · posición ${hardware.feederPosition ?? '-'}` : 'Sin referenciar'}</small></span>
          <span><strong>Sensores</strong><small>Ranura {sensors.carouselHome ? 'activa' : 'libre'} · HOME receptor {sensors.feederHome ? 'activo' : 'libre'} · Pastilla {sensors.pillDetected ? 'detectada' : 'sin detección'}</small></span>
          <span><strong><Clock3 size={14} /> RTC DS3231</strong><small>{clock.valid
            ? Number.isFinite(Number(clock.localUnixTime))
              ? `${formatDeviceLocalTime(clock.localUnixTime)} · ${formatTimezoneOffset(clock.timezoneOffsetMinutes)}`
              : clock.iso ? new Date(clock.iso).toLocaleString() : 'Hora disponible; actualiza las lecturas'
            : 'Hora no disponible; sincroniza con el teléfono o espera sincronización NTP con internet.'}</small></span>
          <span><strong>Dispensación por horario</strong><small>{!hardware.carouselHomed
            ? 'En espera: falta HOME del carrusel.'
            : !hardware.feederHomed
              ? 'En espera: falta HOME del disco receptor.'
              : hardware.scheduleClockAligned === false
                ? 'Pausada: no se pudieron recalcular las tomas tras corregir el reloj.'
              : !clock.valid
                ? 'En espera: sincroniza el RTC.'
                : Number(hardware.scheduleCount) === 0
                  ? 'Lista mecánicamente, pero no hay agenda sincronizada.'
                  : 'Lista: el ESP32 revisa la agenda cada segundo.'}</small></span>
          <span><strong>Agenda automática</strong><small>{scheduleFaultCount ? `${scheduleFaultCount} compartimento(s) requieren revisión` : `${hardware.scheduleCount || 0} compartimento(s) programados`}</small></span>
          <span><strong>Próxima toma</strong><small>{hardware.nextMedication && hardware.nextDue
            ? `${hardware.nextMedication} · ${formatDeviceLocalTime(hardware.nextDue)} · ${formatTimezoneOffset(clock.timezoneOffsetMinutes)}`
            : 'No hay una próxima toma instalada'}</small></span>
          {hardware?.oneTimeSchedule?.enabled && <span><strong>Toma única programada</strong><small>{hardware.oneTimeSchedule.faulted
            ? 'Requiere revisión; no se reintentará automáticamente.'
            : `${hardware.oneTimeSchedule.medicationName} · ${formatDeviceLocalTime(hardware.oneTimeSchedule.nextDue)} · ${formatTimezoneOffset(clock.timezoneOffsetMinutes)}`}</small></span>}
        </div>
      )}
      {connected && <button type="button" className="outline-button hardware-refresh" onClick={() => run((url, key) => deviceApi.status(url, key), 'Lecturas del dispositivo actualizadas')} disabled={busy}>Actualizar lecturas del dispositivo</button>}
      <div className="hardware-controls">
        <div className="hardware-control-group">
          <strong>Posición del carrusel</strong>
          <div className="hardware-position-grid">
            <button type="button" onClick={() => run(deviceApi.homeCarousel, 'Carrusel referenciado')} disabled={busy || !connected}>HOME</button>
            {Array.from({ length: 8 }, (_, position) => <button type="button" key={position} className={Number(hardware?.carouselPosition) === position ? 'current' : ''} onClick={() => run((url, key) => deviceApi.moveCarousel(url, position, key), `Carrusel en posición ${position}`)} disabled={busy || !connected || !hardware?.carouselHomed}>{position === 0 ? '0 · Salida' : position}</button>)}
          </div>
          <button type="button" className="outline-button" onClick={() => {
            if (!window.confirm('¿Vibrar durante 2 segundos en la posición actual?')) return
            run(deviceApi.vibrateCarousel, 'Vibración del carrusel completada')
          }} disabled={busy || !connected || !hardware?.carouselHomed}>Vibrar posición actual · 2 s</button>
          <button type="button" className="outline-button" onClick={() => {
            if (!window.confirm('La prueba recorrerá y vibrará los 7 compartimentos. Confirma que el carrusel está despejado y sin medicamentos.')) return
            run(deviceApi.testAllCarouselCompartments, 'Prueba de los siete compartimentos completada')
          }} disabled={busy || !connected}>Probar los 7 compartimentos</button>
        </div>
        <div className="hardware-control-group hardware-actions">
          <strong>Disco receptor 5 V · prueba sin medicamento</strong>
          <button type="button" className="outline-button" onClick={() => run(deviceApi.homeFeeder, 'Disco singularizador en HOME')} disabled={busy || !connected}>Referenciar disco</button>
          <strong>Probar cavidad del disco</strong>
          <div className="feeder-position-grid">
            {[
              ['large', 'Grande · 0°'],
              ['small', 'Pequeña · 90°'],
              ['medium', 'Mediana · 180°'],
            ].map(([size, label]) => {
              return (
                <button
                  type="button"
                  key={size}
                  className="outline-button"
                  onClick={() => {
                    if (!window.confirm(`¿Probar la cavidad ${label}? Usa el dispensador sin medicamentos.`)) return
                    run((url, key) => deviceApi.moveFeeder(url, size, key), `Ciclo de prueba para pastilla ${size}`)
                  }}
                  disabled={busy || !connected || !hardware?.feederHomed || !hardware?.carouselHomed || Number(hardware?.carouselPosition) !== 0}
                >{label}</button>
              )
            })}
          </div>
          <button type="button" className="outline-button" onClick={() => run((url, key) => deviceApi.setClock(url, new Date(), key), 'Reloj del dispensador sincronizado')} disabled={busy || !connected || Boolean(hardware?.oneTimeSchedule?.enabled)}>Sincronizar RTC</button>
          <strong>Programar una toma única dentro de unos minutos</strong>
          <label htmlFor="one-time-dose-compartment">Compartimento que se dispensará</label>
          <select
            id="one-time-dose-compartment"
            value={oneTimeCompartment}
            onChange={(event) => setOneTimeCompartment(Number(event.target.value))}
            disabled={busy || Boolean(hardware?.oneTimeSchedule?.enabled)}
          >
            {compartments.map((item) => (
              <option key={item.slot} value={Number(item.slot)}>
                {`Compartimento ${String(item.slot).padStart(2, '0')} · ${item.medicationName || 'Sin asignar'} · ${Number(item.amount || 0)} disponibles`}
              </option>
            ))}
          </select>
          <small className="hardware-note">{oneTimeItemAvailable
            ? `Se dispensarán ${oneTimePillsPerDose} pastilla(s) de ${oneTimeItem.medicationName} desde el compartimento ${String(oneTimeCompartment).padStart(2, '0')}.`
            : 'Elige un compartimento con medicamento configurado y existencias suficientes.'}</small>
          <label htmlFor="one-time-dose-minutes">Girar dentro de cuántos minutos</label>
          <input
            id="one-time-dose-minutes"
            type="number"
            min="1"
            max="10080"
            step="1"
            value={oneTimeMinutes}
            onChange={(event) => setOneTimeMinutes(Number(event.target.value))}
            disabled={busy || Boolean(hardware?.oneTimeSchedule?.enabled)}
          />
          <small className="hardware-note">Entre 1 y 10080 minutos (7 días). Al encender, el ESP32 intenta sincronizar el reloj por internet y reintenta cada 30 segundos hasta lograrlo. Para ello debe tener configurada una Wi‑Fi con acceso a NTP. La toma usa el tamaño, las pastillas por dosis y el saldo guardados en la agenda del ESP32.</small>
          <button
            type="button"
            className="outline-button"
            onClick={() => {
              if (!window.confirm(`¿Programar una sola toma de ${oneTimePillsPerDose} pastilla(s) de ${oneTimeItem?.medicationName} desde el compartimento ${oneTimeCompartment} dentro de ${oneTimeMinutes} minuto(s)? El dispensador se moverá automáticamente.`)) return
              run((url, key) => deviceApi.scheduleOnce(url, oneTimeCompartment, oneTimeMinutes, key), 'Toma única programada')
            }}
            disabled={Boolean(oneTimeBlockReason) || !Number.isInteger(oneTimeMinutes) || oneTimeMinutes < 1 || oneTimeMinutes > 10080}
          >Programar esta toma</button>
          {oneTimeBlockReason && <small className="hardware-note" role="status">{oneTimeBlockReason}</small>}
          {hardware?.oneTimeSchedule?.enabled && <button
            type="button"
            className="outline-button"
            onClick={() => {
              if (!window.confirm('¿Cancelar la toma única pendiente?')) return
              run(deviceApi.cancelScheduleOnce, 'Toma única cancelada')
            }}
            disabled={busy || !connected}
          >Cancelar toma única</button>}
          <button
            type="button"
            className="outline-button"
            onClick={() => run((url, key) => deviceApi.setSchedules(url, compartments, key), 'Agenda automática sincronizada con el ESP32')}
            disabled={busy || !connected || !clock.valid || Boolean(hardware?.oneTimeSchedule?.enabled) || !compartments.some((item) => item.active && item.medicationName !== 'Sin asignar')}
          >Sincronizar agenda automática</button>
          <button type="button" className="outline-button" onClick={() => {
            if (!window.confirm('¿Borrar la agenda automática guardada en el ESP32? Los medicamentos de la app no se borrarán.')) return
            run((url, key) => deviceApi.setSchedules(url, [], key), 'Agenda automática borrada del ESP32')
          }} disabled={busy || !connected || oneTimePending}>Borrar agenda automática del ESP32</button>
          {oneTimePending && <small className="hardware-note" role="status">No se puede borrar la agenda mientras exista una toma única pendiente. Cancela primero la toma única; después podrás modificar o borrar la agenda.</small>}
          {!clock.valid && <small className="hardware-note">Sincroniza el RTC antes de instalar la agenda.</small>}
          <label htmlFor="physical-compartment">Compartimento físico</label>
          <select id="physical-compartment" value={physicalCompartment} onChange={(event) => setPhysicalCompartment(Number(event.target.value))}>
            {Array.from({ length: 7 }, (_, index) => {
              const slot = index + 1
              const item = compartments.find((compartment) => Number(compartment.slot) === slot)
              return <option key={slot} value={slot}>{String(slot).padStart(2, '0')} · {item?.medicationName || 'Sin asignar'}</option>
            })}
          </select>
          <button type="button" className="outline-button" onClick={() => {
            if (!window.confirm(`¿Probar el carrusel en el compartimento ${physicalCompartment}, vibrar 2 segundos y volver a HOME? Confirma que está despejado y sin medicamento.`)) return
            run((url, key) => deviceApi.runCarouselCompartment(url, physicalCompartment, key), `Prueba del carrusel en compartimento ${physicalCompartment} completada`)
          }} disabled={busy || !connected}>Probar carrusel · vibrar y volver a HOME</button>
          <strong>Pruebas de luces</strong>
          <button type="button" className="outline-button" onClick={() => run((url, key) => deviceApi.indicateCompartment(url, physicalCompartment, key), `Luz del compartimento ${physicalCompartment} encendida`)} disabled={busy || !connected}>Probar luz del compartimento seleccionado</button>
          <button type="button" className="outline-button" onClick={() => run(deviceApi.testOutputIndicator, 'Luz de salida encendida durante 10 segundos')} disabled={busy || !connected}>Probar luz de salida Q0 · 10 s</button>
          <small className="hardware-note">Las lecturas de los sensores se actualizan automáticamente. Interrumpe cada herradura y comprueba el cambio de estado; el sensor de caída solo detecta el paso por su haz.</small>
          <strong>Prueba de audio · DFPlayer</strong>
          <label htmlFor="audio-track">Pista en carpeta 01 (1–255)</label>
          <input id="audio-track" type="number" min="1" max="255" step="1" value={audioTrack} onChange={(event) => setAudioTrack(Number(event.target.value))} />
          <label htmlFor="audio-volume">Volumen (0–30)</label>
          <input id="audio-volume" type="number" min="0" max="30" step="1" value={audioVolume} onChange={(event) => setAudioVolume(Number(event.target.value))} />
          <button type="button" className="outline-button" onClick={() => run((url, key) => deviceApi.playAudioTrack(url, audioTrack, audioVolume, key), `Orden enviada para reproducir la pista ${audioTrack} de la carpeta 01`)} disabled={busy || !connected || !Number.isInteger(audioTrack) || audioTrack < 1 || audioTrack > 255 || !Number.isInteger(audioVolume) || audioVolume < 0 || audioVolume > 30}>Reproducir pista de prueba</button>
          <small className="hardware-note">Guarda los audios en la carpeta 01 de la tarjeta SD con nombres numéricos (por ejemplo, 001.mp3). La respuesta confirma que se envió la orden, no que el altavoz reprodujo audio.</small>
          <button type="button" className="primary-button" onClick={() => {
            const compartment = physicalCompartment
            const configuredPillSize = physicalItem?.pillSize
            if (blocked) return setError('El horario de bloqueo está activo. No se envió el comando.')
            if (!window.confirm(`¿Dispensar ${physicalPillsPerDose} pastilla(s) ${configuredPillSize} del compartimento ${compartment}? No habrá reintento automático si el sensor no detecta la caída.`)) return
            run((url, key) => deviceApi.dispense(url, compartment, configuredPillSize, key, physicalPillsPerDose), `Ciclo del compartimento ${compartment} completado`, (result) => onDispenseSuccess(compartment, Number(result.pillsDispensed || physicalPillsPerDose)))
          }} disabled={busy || !connected || !hardware?.feederHomed || blocked || !physicalItemAvailable || !['large', 'small', 'medium'].includes(physicalItem?.pillSize)}>{busy ? 'Ejecutando...' : 'Dispensar ahora'}</button>
        </div>
      </div>
      <p className="hardware-note">Las pruebas de movimiento deben hacerse sin medicamentos y con el mecanismo despejado. Comprueba HOME, sentido y alineación antes de dispensar; usa pastillas ficticias para validar sensor e inventario.</p>
    </section>
  )
}

function HistoryView({ events, onNavigate }) {
  return <><PageHeading eyebrow="Módulo 04" title="Historial" />{events.length ? <section className="event-section"><div className="section-title compact"><div><p className="eyebrow">ACTIVIDAD REGISTRADA</p><h2>Registro de actividad</h2></div></div>{events.map((item) => <Event key={item.id || `${item.slot}-${item.created_at}`} icon={item.message?.includes('añadido') ? Plus : Check} tone="success" title={item.message?.includes('añadido') ? 'Medicamento añadido' : item.message?.includes('actualizada') ? 'Medicamento actualizado' : item.message?.includes('registrada') ? 'Configuración registrada' : item.medication_name || 'Dosis dispensada'} detail={`${item.medication_name ? `${item.medication_name} · ` : ''}Compartimento ${String(item.slot).padStart(2, '0')} · ${new Date(item.created_at).toLocaleString()}`} />)}</section> : <EmptyGuide eyebrow="SIN ACTIVIDAD TODAVÍA" title="Aquí verás tu historial" description="Cuando añadas un medicamento o uses el dispensador, aquí aparecerán los eventos de tu actividad." action="Configurar dispensador" onAction={() => onNavigate('dispenser')} />}</>
}

function Event({ icon: Icon, tone, title, detail }) {
  return <div className="event-row"><div className={`event-icon ${tone}`}><Icon size={17} /></div><div><strong>{title}</strong><small>{detail}</small></div><ChevronRight size={16} /></div>
}

function SettingsView({ device, profile, profileSaving, deviceSettingsSaving, onSaveProfile, onSaveNightWindow, onOpenGuide }) {
  const [fullName, setFullName] = useState(profile.full_name || '')
  const [nightStart, setNightStart] = useState(device.nightStart || '00:00')
  const [nightEnd, setNightEnd] = useState(device.nightEnd || '06:00')

  useEffect(() => setFullName(profile.full_name || ''), [profile.full_name])
  useEffect(() => {
    setNightStart(device.nightStart || '00:00')
    setNightEnd(device.nightEnd || '06:00')
  }, [device.nightStart, device.nightEnd])

  const submitNightWindow = (event) => {
    event.preventDefault()
    onSaveNightWindow({ nightStart, nightEnd })
  }

  return (
    <>
      <PageHeading eyebrow="Módulo 05" title="Ajustes" />
      <section className="profile-card">
        <div className="profile-avatar">{(profile.full_name || 'U').slice(0, 2).toUpperCase()}</div>
        <div className="profile-details">
          <strong>{profile.full_name || 'Tu perfil'}</strong>
          <span>{profile.email || 'Cuenta de usuario'}</span>
          <label className="profile-name-field">
            <span>Nombre</span>
            <input value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Tu nombre completo" />
          </label>
          <button className="primary-button profile-save" type="button" disabled={profileSaving || !fullName.trim()} onClick={() => onSaveProfile(fullName)}>
            {profileSaving ? 'Guardando...' : 'Guardar perfil'}
          </button>
        </div>
      </section>
      <section className="night-window-panel">
        <div>
          <p className="eyebrow">HORARIO DE BLOQUEO</p>
          <h2>Bloqueo nocturno</h2>
          <p>Si las horas coinciden, no hay bloqueo.</p>
        </div>
        <form className="night-window-form" onSubmit={submitNightWindow}>
          <label><span>Desde</span><input type="time" value={nightStart} onChange={(event) => setNightStart(event.target.value)} required /></label>
          <label><span>Hasta</span><input type="time" value={nightEnd} onChange={(event) => setNightEnd(event.target.value)} required /></label>
          <button className="primary-button" type="submit" disabled={deviceSettingsSaving}>{deviceSettingsSaving ? 'Guardando...' : 'Guardar'}</button>
        </form>
      </section>
      <div className="settings-group">
        <p className="eyebrow">RED DE CUIDADO</p>
        <SettingRow icon={UserRound} title="Contactos de emergencia" detail="Próximamente" onClick={() => onOpenGuide('contacts-guide')} />
        <SettingRow icon={Bell} title="Alertas y tolerancia" detail="Próximamente" onClick={() => onOpenGuide('alerts-guide')} />
      </div>
      <div className="settings-group">
        <p className="eyebrow">DISPENSADOR</p>
        <SettingRow icon={Wifi} title="Red del dispensador" detail={`${device.wifiName || 'Sin configurar'} · ${device.connectionStatus || 'Sin conectar'}`} onClick={() => onOpenGuide('network-guide')} />
      </div>
      <div className="settings-group">
        <p className="eyebrow">RECORDATORIOS</p>
        <SettingRow icon={Mic} title="Mensaje de voz familiar" detail={device.voiceMessage || 'Sin configurar'} onClick={() => onOpenGuide('voice-guide')} />
        <SettingRow icon={Tablet} title="Intensidad y vibración" detail="Próximamente" onClick={() => onOpenGuide('tablet-guide')} />
      </div>
    </>
  )
}

function SettingRow({ icon: Icon, title, detail, connected, onClick }) {
  return <button className="setting-row" onClick={onClick}><div className="setting-icon"><Icon size={19} /></div><span><strong>{title}</strong><small>{detail}</small></span>{connected && <span className="connected-label"><span className="online-dot" /> Activo</span>}<ChevronRight size={17} /></button>
}

function Modal({ type, medication, close, onConfirm }) {
  const actions = {
    'setup-guide': { icon: Lightbulb, eyebrow: 'GUÍA RÁPIDA', title: 'Configura un medicamento', steps: ['Elige un compartimento.', 'Anota medicamento, dosis y cantidad.', 'Guarda los cambios.'], confirm: 'Ir al dispensador' },
    'network-guide': { icon: Wifi, eyebrow: 'GUÍA RÁPIDA', title: 'Conecta el dispensador', text: 'Escribe la dirección local y la clave del ESP32 en Mi dispensador.', confirm: 'Ir al dispensador' },
    'contacts-guide': { icon: UserRound, eyebrow: 'CONTACTOS', title: 'Próximamente', text: 'Esta opción estará disponible más adelante.', confirm: 'Cerrar' },
    'alerts-guide': { icon: Bell, eyebrow: 'ALERTAS', title: 'Próximamente', text: 'Esta opción estará disponible más adelante.', confirm: 'Cerrar' },
    'voice-guide': { icon: Mic, eyebrow: 'MENSAJE DE VOZ', title: 'Configura un mensaje', text: 'Abre Mi dispensador para cambiar el mensaje de voz.', confirm: 'Ir al dispensador' },
    'tablet-guide': { icon: Tablet, eyebrow: 'VIBRACIÓN', title: 'Próximamente', text: 'Esta opción estará disponible más adelante.', confirm: 'Cerrar' },
    travel: { icon: Smartphone, eyebrow: 'MODO VIAJE', title: 'Prepara tu viaje', text: 'Elige las dosis que llevarás.', confirm: 'Configurar viaje' },
    refill: { icon: Lightbulb, eyebrow: 'GUÍA DE RECARGA', title: 'Recarga el cartucho', text: 'Sigue las indicaciones del dispensador. Haz la prueba sin pastillas.', confirm: 'Entendido' },
  }
  const data = type === 'medication'
    ? { icon: Pill, eyebrow: 'FICHA DEL MEDICAMENTO', title: medication?.medicationName || 'Medicamento', text: 'Información configurada para este tratamiento.', confirm: 'Cerrar' }
    : actions[type] || { icon: Zap, eyebrow: 'ACCIÓN', title: 'Acción del dispensador', text: 'La operación se realizará cuando esté activa.', confirm: 'Continuar' }

  const Icon = data.icon
  const canContinue = !['contacts-guide', 'alerts-guide', 'tablet-guide'].includes(type)
  return <div className="modal-backdrop" onMouseDown={close}><div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-title" onMouseDown={(event) => event.stopPropagation()}><button className="modal-close icon-button" onClick={close} aria-label="Cerrar mensaje"><X size={19} /></button><div className="modal-icon"><Icon size={24} /></div><p className="eyebrow">{data.eyebrow}</p><h2 id="modal-title">{data.title}</h2>{data.steps ? <ol className="modal-steps">{data.steps.map((step) => <li key={step}>{step}</li>)}</ol> : <p className="modal-text">{data.text}</p>}{type === 'medication' && medication && <dl className="medication-detail-list"><div><dt>Compartimento</dt><dd>#{String(medication.slot).padStart(2, '0')}</dd></div><div><dt>Dosis</dt><dd>{medication.dose ? `${medication.dose} ${medication.doseUnit || 'mg'}` : 'Sin especificar'}</dd></div><div><dt>Pastillas por toma</dt><dd>{medication.pillsPerDose || 1}</dd></div><div><dt>Inicio y frecuencia</dt><dd>{medication.startTime ? `Desde ${medication.startTime}` : 'Sin hora'} · {medication.frequencyHours ? `cada ${medication.frequencyHours} horas` : 'sin configurar'}</dd></div><div><dt>Existencias</dt><dd>{Number(medication.amount || 0)} pastillas</dd></div>{medication.notes && <div><dt>Indicaciones</dt><dd>{medication.notes}</dd></div>}</dl>}{canContinue && <button className="primary-button full" onClick={onConfirm}>{data.confirm}{type !== 'medication' && type !== 'refill' && <ChevronRight size={17} />}</button>}{type !== 'medication' && canContinue && <button className="text-button centered" onClick={close}>Cerrar</button>}</div></div>
}

createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>)
