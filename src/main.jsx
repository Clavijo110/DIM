import { StrictMode, useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  Activity, AlertTriangle, Bell, Bluetooth, CalendarDays, Check, ChevronRight,
  FileText, HeartPulse, Home, Lightbulb, Menu, Mic, Package, Pill, Plus,
  QrCode, Settings, ShieldCheck, Smartphone, Tablet, Upload, UserRound, Wifi,
  X, Zap
} from 'lucide-react'
import './styles.css'
import {
  defaultDeviceSettings,
  fetchUserProfile,
  fetchDispenserState,
  formatSupabaseAuthError,
  sendNotification,
  signInWithEmail,
  signOut,
  signUpWithEmail,
  sendDispenseEvent,
  supabase,
  syncUserProfile,
  updateUserProfile,
  withSupabaseTimeout,
  upsertCompartments,
  upsertDeviceSettings,
} from './lib/supabase'
import { getSlotAngle, isRestrictedNightWindow, isValidMedicationFrequencyHours } from './lib/dispenserLogic'

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
  frequencyHours: null,
  amount: 0,
  active: false,
  notes: '',
})

const defaultCompartments = Array.from({ length: 8 }, (_, index) => buildDefaultCompartment(index + 1))

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

  useEffect(() => {
    let isMounted = true

    const initAuth = async () => {
      if (!supabase) {
        setAuthError('Supabase no está configurado. Comprueba las variables VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.')
        setAuthLoading(false)
        return
      }

      try {
        const { data: { session: currentSession } } = await withSupabaseTimeout(
          supabase.auth.getSession(),
          10000,
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

      if (!isMounted) return

      const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
        if (!isMounted) return
        setSession(nextSession)
        setUser(nextSession?.user ?? null)
      })

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
    window.setTimeout(() => setToast(''), 2600)

    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body: message })
    }

    try {
      await sendNotification({ title, message, priority: 'normal', userId: user?.id })
    } catch (error) {
      console.warn('No se pudo guardar la notificación local:', error)
    }
  }

  const handleEmailAuth = async (event) => {
    event.preventDefault()

    try {
      setAuthLoading(true)
      setAuthError('')

      if (authMode === 'signup') {
        const { error, data } = await signUpWithEmail({
          email: authForm.email,
          password: authForm.password,
          fullName: authForm.fullName,
        })

        if (error) throw error

        if (data?.user && !data.session) {
          setToast('Cuenta creada. Revisa tu correo para confirmar la cuenta antes de entrar.')
          window.setTimeout(() => setToast(''), 4200)
          setAuthMode('login')
          setAuthForm({ fullName: '', email: authForm.email, password: '' })
          return
        }

        setToast('Cuenta creada correctamente. Ya puedes entrar.')
        setAuthMode('login')
        setAuthForm({ fullName: '', email: authForm.email, password: '' })
        return
      }

      const { error } = await signInWithEmail({
        email: authForm.email,
        password: authForm.password,
      })

      if (error) throw error

      setToast('Sesión iniciada correctamente')
      window.setTimeout(() => setToast(''), 2200)
    } catch (error) {
      const message = formatSupabaseAuthError(error)
      setAuthError(message)
      setToast(message)
      window.setTimeout(() => setToast(''), 4200)
      console.error(error)
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

  if (!session || !user) {
    return (
      <LoginScreen
        authMode={authMode}
        authLoading={authLoading}
        authError={authError}
        authForm={authForm}
        setAuthForm={setAuthForm}
        setAuthMode={setAuthMode}
        onSubmit={handleEmailAuth}
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
          : value
      const nextItem = { ...item, [field]: nextValue }

      if (field === 'medicationName' && nextValue && String(nextValue).trim() !== 'Sin asignar') {
        nextItem.active = true
      }

      if (field === 'active' && !nextValue) {
        nextItem.medicationName = 'Sin asignar'
        nextItem.dose = ''
        nextItem.frequencyHours = null
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
      frequencyHours: item.frequencyHours === '' || item.frequencyHours == null ? null : Number(item.frequencyHours),
      amount: Math.max(0, Number(item.amount) || 0),
      rotation: getSlotAngle(item.slot),
      active: Boolean(Boolean(item.medicationName && item.medicationName.trim() && item.medicationName.trim() !== 'Sin asignar') || Number(item.amount) > 0),
    }))

    const configuredCompartments = sanitized.filter((item) => item.medicationName !== 'Sin asignar' || item.amount > 0)
    if (!configuredCompartments.length) {
      await notify('Empieza indicando un medicamento y su cantidad en un compartimento.', 'Guía')
      return
    }
    if (configuredCompartments.some((item) => !isValidMedicationFrequencyHours(item.frequencyHours))) {
      await notify('Indica un intervalo entero entre 1 y 168 horas para cada medicamento.', 'Guía')
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
        || previous.frequencyHours !== item.frequencyHours
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
          if (!previous || previous.medicationName !== item.medicationName || previous.dose !== item.dose || previous.frequencyHours !== item.frequencyHours || Number(previous.amount) !== Number(item.amount)) {
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
      await notify(
        eventsFailed
          ? 'Medicamento guardado, pero no se pudo registrar en el historial. Revisa la migración SQL de Supabase.'
          : changedCompartments.length
            ? 'Medicamento guardado y registrado en Historial'
            : 'Configuración guardada; no hubo cambios para registrar',
        'DIM',
      )
    } else {
      await notify('No se pudo guardar la configuración. Reintenta en unos segundos.', 'DIM')
    }
  }

  const renderView = () => {
    if (active === 'home') return <HomeView data={deviceData} activeMedication={activeMedication} displayName={displayName} notify={notify} onNavigate={setActive} onMedicationDetail={(medication) => setModal({ type: 'medication', medication })} />
    if (active === 'treatments') return <TreatmentsView data={deviceData} onAction={setModal} onNavigate={setActive} />
    if (active === 'dispenser') return (
      <DispenserView
        data={deviceData}
        formData={formData}
        updateForm={updateForm}
        saveConfiguration={saveConfiguration}
        loading={loading}
        notify={notify}
      />
    )
    if (active === 'history') return <HistoryView events={deviceData.dispenseEvents || []} onNavigate={setActive} />
    return <SettingsView device={deviceData.device} profile={profile} profileSaving={profileSaving} deviceSettingsSaving={deviceSettingsSaving} onSaveProfile={saveProfile} onSaveNightWindow={saveNightWindow} notify={notify} />
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
      {modal && <Modal type={typeof modal === 'string' ? modal : modal.type} medication={typeof modal === 'string' ? null : modal.medication} close={() => setModal(null)} onConfirm={() => { const type = typeof modal === 'string' ? modal : modal.type; setModal(null); if (type !== 'medication') notify(type === 'travel' ? 'Modo viaje configurado' : 'Guía de recarga iniciada', 'DIM') }} />}
      {toast && <div className="toast"><Check size={17} />{toast}</div>}
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

  return (
    <div className="login-shell">
      <div className="login-card">
        <div className="login-panel left-panel">
          <div className="brand"><div className="brand-mark"><HeartPulse size={20} /></div><span>DIM</span></div>
          <p className="login-kicker">Plataforma segura</p>
          <h1>Accede a tu dispensador inteligente</h1>
          <p className="login-copy">Gestiona los compartimentos, revisa el stock y sincroniza la fórmula médica en tiempo real con tu cuenta protegida.</p>
          <ul className="login-features">
            <li>Configuración por compartimento</li>
            <li>Sincronización con Supabase</li>
            <li>Bloqueo nocturno 00:00 – 06:00</li>
          </ul>
        </div>

        <div className="login-panel right-panel">
          <div className="login-badge">Seguridad activa</div>
          <h2>{isLogin ? 'Inicia sesión' : 'Crea tu cuenta'}</h2>

          <form className="auth-form" onSubmit={onSubmit}>
            {authError && <p className="auth-error" role="alert">{authError}</p>}
            {!isLogin && (
              <label className="auth-input-wrap">
                <span>Nombre completo</span>
                <input
                  type="text"
                  value={authForm.fullName}
                  onChange={(event) => setAuthForm((current) => ({ ...current, fullName: event.target.value }))}
                  placeholder="Tu nombre"
                  required={!isLogin}
                />
              </label>
            )}

            <label className="auth-input-wrap">
              <span>Correo electrónico</span>
              <input
                type="email"
                value={authForm.email}
                onChange={(event) => setAuthForm((current) => ({ ...current, email: event.target.value }))}
                placeholder="alba@dim.app"
                required
              />
            </label>

            <label className="auth-input-wrap">
              <span>Contraseña</span>
              <input
                type="password"
                value={authForm.password}
                onChange={(event) => setAuthForm((current) => ({ ...current, password: event.target.value }))}
                placeholder="********"
                minLength={6}
                required
              />
            </label>

            <button className="primary-button full" type="submit" disabled={authLoading}>
              {authLoading ? 'Procesando...' : isLogin ? 'Entrar' : 'Crear cuenta'}
            </button>
          </form>

          <div className="login-toggle-row">
            <button type="button" className="text-button" onClick={() => setAuthMode(isLogin ? 'signup' : 'login')}>
              {isLogin ? 'Crear cuenta' : 'Ya tengo cuenta'}
            </button>
          </div>

          <p className="login-legal">Al iniciar sesión aceptas la política de privacidad y el uso de tus datos para gestionar tu medicación.</p>
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

function HomeView({ data, activeMedication, displayName, notify, onNavigate, onMedicationDetail }) {
  const scheduled = data.compartments.filter((slot) => slot.active && Number(slot.amount) > 0).slice(0, 3)
  const rows = scheduled.map((slot) => ({
    time: slot.frequencyHours ? String(slot.frequencyHours) : '--',
    period: slot.frequencyHours ? 'h · cada' : 'sin intervalo',
    name: slot.medicationName,
    medication: slot,
    dose: slot.dose || 'Dosis personalizable',
    detail: `${Number(slot.amount)} pastilla${Number(slot.amount) === 1 ? '' : 's'}`,
    status: Number(slot.amount) > 0 ? 'next' : 'taken',
    cart: `${String(slot.slot).padStart(2, '0')}`,
    color: slot.slot % 2 === 0 ? 'blue' : 'red',
    stamp: `${slot.frequencyHours ? `Cada ${slot.frequencyHours} horas` : 'Frecuencia sin configurar'} · ${slot.amount} disponibles`,
  }))

  const currentHour = new Date().getHours()
  const nightBlocked = isRestrictedNightWindow(new Date(), data.device.nightStart, data.device.nightEnd)
  const hasMedication = data.compartments.some((slot) => slot.active && slot.medicationName !== 'Sin asignar')

  return (
    <>
      <PageHeading eyebrow="Miércoles, 10 de septiembre" title={`Buenos días, ${displayName}`} action={{ label: 'Modo viaje', icon: Zap }} onAction={() => notify('Modo viaje configurado', 'DIM')} />
      <section className="hardware-strip"><div className="hardware-copy"><span className="live-label"><span className="live-dot" /> {data.connected ? 'EN VIVO' : 'INICIO'}</span><strong>{nightBlocked ? 'Horario configurado: dispensación bloqueada' : hasMedication ? 'Tu plan está preparado' : 'Tu espacio está listo para configurar'}</strong><small>{nightBlocked ? `Bloqueo activo de ${data.device.nightStart} a ${data.device.nightEnd}` : hasMedication ? `Última sincronización: ${currentHour}:00` : 'Añade tus medicamentos para empezar'}</small></div><div className="hardware-stats"><span><Wifi size={17} /> {data.device.wifiName || 'Wi-Fi sin configurar'}</span><span><Bluetooth size={17} /> Pulsera opcional</span><span><Zap size={17} /> {data.connected ? 'Conectado' : 'Sin conectar'}</span></div></section>
      {!hasMedication && <GettingStarted onNavigate={onNavigate} />}
      <section className="next-dose-card"><div className="next-dose-top"><div><p className="eyebrow light">{activeMedication ? 'INTERVALO CONFIGURADO' : 'PRÓXIMA TOMA'} <span className="countdown">{activeMedication ? `CADA ${activeMedication.frequencyHours || '?'} H` : 'SIN PROGRAMAR'}</span></p><h2>{activeMedication ? activeMedication.medicationName.split(' ')[0] || 'Medicamento' : 'Sin' } <span>{activeMedication ? activeMedication.dose || 'configurado' : 'programación'}</span></h2><p className="dose-location"><span className="mini-led blue" /> Compartimento <b>#{String(activeMedication?.slot || 1).padStart(2, '0')}</b> · {activeMedication ? 'Activo' : 'Vacío'}</p></div><div className="dose-illustration"><PillVisual color="blue" size="large" /><PillVisual color="white" size="large" /></div></div><div className="dose-info"><div><strong>{activeMedication ? activeMedication.medicationName : 'Sin medicamento'}</strong><span>{activeMedication ? `${activeMedication.amount} pastillas · frecuencia informativa` : 'Configurar en dispensador'}</span></div></div></section>
      <section className="section-block"><div className="section-title"><div><p className="eyebrow">TU PROGRESO</p><h2>Agenda de hoy</h2></div><span className="progress-count">{rows.length} <small>tomas</small></span></div>{rows.length > 0 ? <><div className="progress-track"><span /></div><div className="timeline">{rows.map((dose, index) => <DoseRow key={`${dose.cart}-${dose.name}-${index}`} dose={dose} last={index === rows.length - 1} onAction={() => onMedicationDetail(dose.medication)} />)}</div></> : <p className="empty-inline">Tu agenda aparecerá aquí cuando configures un medicamento.</p>}</section>
    </>
  )
}

function DoseRow({ dose, last, onAction }) {
  return <div className={`dose-row ${dose.status}`}><div className="time-col"><strong>{dose.time}</strong><span>{dose.period}</span></div><div className="timeline-line"><span className={`timeline-dot ${dose.status}`} />{!last && <i />}</div><div className="dose-main"><div className="dose-title"><div><strong>{dose.name}</strong><span>{dose.dose} · {dose.detail}</span></div>{dose.status === 'taken' ? <StatusPill tone="success">Completada</StatusPill> : <StatusPill tone="warning">Pendiente</StatusPill>}</div><div className="dose-meta"><span className={`mini-led ${dose.color}`} /> Cartucho #{dose.cart} <span className="meta-separator" /> {dose.stamp}</div>{dose.status === 'next' && <button className="text-button" onClick={onAction}>Ver detalle <ChevronRight size={15} /></button>}</div></div>
}

function TreatmentsView({ data, onAction, onNavigate }) {
  const medications = data.compartments.filter((slot) => slot.active && slot.medicationName !== 'Sin asignar')

  return <><PageHeading eyebrow="Módulo 02" title="Tratamientos" action={{ label: 'Añadir medicamento', icon: Plus }} onAction={() => onNavigate('dispenser')} />{medications.length ? <><div className="section-title compact"><div><p className="eyebrow">PLAN ACTIVO</p><h2>Medicamentos programados</h2></div></div>{medications.map((slot) => <div className="medication-list-item" key={slot.slot}><PillVisual color={slot.slot % 2 === 0 ? 'blue' : 'red'} /><span><strong>{slot.medicationName}</strong><small>{slot.dose || 'Dosis sin especificar'} · {slot.frequencyHours ? `Cada ${slot.frequencyHours} horas` : 'Frecuencia sin especificar'} · Compartimento {String(slot.slot).padStart(2, '0')}</small></span><span className="med-time">{slot.amount} disponibles</span></div>)}</> : <EmptyGuide eyebrow="AÚN NO HAY TRATAMIENTOS" title="Tu plan comienza aquí" description="Registra cada medicamento en un compartimento. Podrás ver aquí tu inventario y seguimiento." action="Configurar dispensador" onAction={() => onNavigate('dispenser')} />}<button className="ocr-banner" onClick={() => onAction('ocr')}><div><QrCode size={22} /><span><strong>Importar fórmula médica</strong><small>Escanea una receta y ahorra tiempo</small></span></div><Upload size={18} /></button></>
}

function GettingStarted({ onNavigate }) {
  return <section className="getting-started"><div className="getting-started-heading"><p className="eyebrow">GUÍA PARA EMPEZAR</p><h2>Configura tu primer medicamento</h2><p>Sigue estos pasos. Puedes volver a esta guía mientras tu cuenta no tenga medicamentos configurados.</p></div><ol className="getting-started-steps"><li><b>1</b><div><strong>Abre Mi dispensador</strong><p>Pulsa “Configurar mi dispensador”. Verás ocho posiciones numeradas. Empieza por el compartimento 01; puedes elegir otro si te conviene.</p></div></li><li><b>2</b><div><strong>Completa los datos del compartimento</strong><p><em>Medicamento:</em> escribe el nombre que aparece en la indicación médica. <em>Dosis:</em> anota la dosis y unidad, por ejemplo “10 mg”. <em>Cada cuántas horas:</em> introduce el intervalo indicado como un número entero, por ejemplo 8. <em>Cantidad:</em> cuenta las pastillas que realmente colocaste en ese compartimento.</p></div></li><li><b>3</b><div><strong>Activa y guarda</strong><p>Marca “Compartimento activo” y pulsa “Guardar configuración”. Espera el mensaje de confirmación. Si aparece un error de Supabase, la configuración no se habrá confirmado.</p></div></li><li><b>4</b><div><strong>Comprueba el resultado</strong><p>En Tratamientos verás el nombre, dosis, intervalo y existencias. En Historial verás cuándo se añadió o actualizó. En Hoy tendrás un resumen del plan guardado.</p></div></li></ol><div className="getting-started-note"><strong>Importante</strong><p>La frecuencia se guarda como información. Por ahora no programa ni activa automáticamente el motor. Sigue siempre la indicación de tu profesional de salud y no cambies la dosis por lo que muestre la app.</p></div><button className="primary-button" onClick={() => onNavigate('dispenser')}>Ir a Mi dispensador <ChevronRight size={16} /></button></section>
}

function EmptyGuide({ eyebrow, title, description, action, onAction }) {
  return <section className="empty-guide"><p className="eyebrow">{eyebrow}</p><h2>{title}</h2><p>{description}</p>{action && <button className="outline-button" onClick={onAction}>{action} <ChevronRight size={16} /></button>}</section>
}

function DispenserView({ data, formData, updateForm, saveConfiguration, loading, notify }) {
  const [selectedSlot, setSelectedSlot] = useState(1)
  const totalStock = data.compartments.reduce((sum, item) => sum + Number(item.amount || 0), 0)
  const activeCount = data.compartments.filter((item) => item.active && Number(item.amount) > 0).length
  const blocked = isRestrictedNightWindow(new Date(), data.device.nightStart, data.device.nightEnd)
  const selectedCompartment = formData.find((item) => item.slot === selectedSlot) || formData[0]

  return (
    <>
      <PageHeading eyebrow="Módulo 03" title="Mi dispensador" action={{ label: 'Guía de recarga', icon: Lightbulb }} onAction={() => notify('Guía de recarga iniciada', 'DIM')} />
      {!formData.some((item) => item.active && item.medicationName !== 'Sin asignar') && <div className="dispenser-hint"><Lightbulb size={18} /><div><strong>Cómo configurar esta pantalla</strong><ol><li>Elige uno de los ocho números; el 01 es el primero.</li><li>Escribe medicamento, dosis, intervalo en horas y cantidad cargada.</li><li>Marca “Compartimento activo” y guarda. Verifica el mensaje de éxito antes de salir.</li></ol><p>La frecuencia debe copiar la indicación profesional. Guardarla no activa por sí sola una dispensación automática.</p></div></div>}
      <section className="dispenser-overview">
        <div className="device-stage">
          <div className="device-ring">
            {data.compartments.map((item, index) => {
              const isActive = Boolean(item.active && item.medicationName && item.medicationName !== 'Sin asignar')
              const isSelected = item.slot === selectedSlot

              return (
                <button
                  key={item.slot}
                  type="button"
                  className={`compartment c${index + 1} ${isActive ? 'active' : 'inactive'} ${isSelected ? 'selected' : ''}`}
                  onClick={() => setSelectedSlot(item.slot)}
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
              onClick={() => setSelectedSlot(item.slot)}
            >
              {String(item.slot).padStart(2, '0')}
            </button>
          )
        })}
      </div>

      {selectedCompartment && (
        <div className="compartment-config-grid">
          <div className="config-card selected-config-card" key={selectedCompartment.slot}>
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
              <input
                type="text"
                value={selectedCompartment.dose}
                onChange={(event) => updateForm(selectedCompartment.slot, 'dose', event.target.value)}
                placeholder="Ej. 850 mg"
              />
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
    </>
  )
}

function HistoryView({ events, onNavigate }) {
  return <><PageHeading eyebrow="Módulo 04" title="Historial" />{events.length ? <section className="event-section"><div className="section-title compact"><div><p className="eyebrow">ACTIVIDAD REGISTRADA</p><h2>Registro de actividad</h2></div></div>{events.map((item) => <Event key={item.id || `${item.slot}-${item.created_at}`} icon={item.message?.includes('añadido') ? Plus : Check} tone="success" title={item.message?.includes('añadido') ? 'Medicamento añadido' : item.message?.includes('actualizada') ? 'Medicamento actualizado' : item.message?.includes('registrada') ? 'Configuración registrada' : item.medication_name || 'Dosis dispensada'} detail={`${item.medication_name ? `${item.medication_name} · ` : ''}Compartimento ${String(item.slot).padStart(2, '0')} · ${new Date(item.created_at).toLocaleString()}`} />)}</section> : <EmptyGuide eyebrow="SIN ACTIVIDAD TODAVÍA" title="Aquí verás tu historial" description="Cuando añadas un medicamento o uses el dispensador, aquí aparecerán los eventos de tu actividad." action="Configurar dispensador" onAction={() => onNavigate('dispenser')} />}</>
}

function Event({ icon: Icon, tone, title, detail }) {
  return <div className="event-row"><div className={`event-icon ${tone}`}><Icon size={17} /></div><div><strong>{title}</strong><small>{detail}</small></div><ChevronRight size={16} /></div>
}

function SettingsView({ device, profile, profileSaving, deviceSettingsSaving, onSaveProfile, onSaveNightWindow, notify }) {
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

  return <><PageHeading eyebrow="Módulo 05" title="Ajustes" /><section className="profile-card"><div className="profile-avatar">{(profile.full_name || 'U').slice(0, 2).toUpperCase()}</div><div className="profile-details"><strong>{profile.full_name || 'Tu perfil'}</strong><span>{profile.email || 'Cuenta de usuario'}</span><label className="profile-name-field"><span>Nombre</span><input value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Tu nombre completo" /></label><button className="primary-button profile-save" type="button" disabled={profileSaving || !fullName.trim()} onClick={() => onSaveProfile(fullName)}>{profileSaving ? 'Guardando...' : 'Guardar perfil'}</button></div></section><section className="night-window-panel"><div><p className="eyebrow">HORARIO DE BLOQUEO</p><h2>Evitar dispensación en este horario</h2><p>El intervalo puede cruzar medianoche. Si ambas horas son iguales, el bloqueo queda desactivado.</p></div><form className="night-window-form" onSubmit={submitNightWindow}><label><span>Desde</span><input type="time" value={nightStart} onChange={(event) => setNightStart(event.target.value)} required /></label><label><span>Hasta</span><input type="time" value={nightEnd} onChange={(event) => setNightEnd(event.target.value)} required /></label><button className="primary-button" type="submit" disabled={deviceSettingsSaving}>{deviceSettingsSaving ? 'Guardando...' : 'Guardar horario'}</button></form></section><div className="settings-group"><p className="eyebrow">RED DE CUIDADO</p><SettingRow icon={UserRound} title="Contactos de emergencia" detail="Aún no has añadido contactos" onClick={() => notify('La configuración de contactos estará disponible próximamente', 'DIM')} /><SettingRow icon={Bell} title="Alertas y tolerancia" detail="Sin configurar" onClick={() => notify('Las alertas se configurarán cuando añadas un tratamiento', 'DIM')} /></div><div className="settings-group"><p className="eyebrow">DISPOSITIVOS</p><SettingRow icon={Bluetooth} title="Pulsera wearable" detail="Sin conectar" onClick={() => notify('No hay una pulsera conectada', 'DIM')} /><SettingRow icon={Wifi} title="Red del dispensador" detail={`${device.wifiName || 'Sin configurar'} · ${device.connectionStatus || 'Sin conectar'}`} onClick={() => notify('Configura la red desde tu dispensador', 'DIM')} /></div><div className="settings-group"><p className="eyebrow">RECORDATORIOS</p><SettingRow icon={Mic} title="Mensaje de voz familiar" detail={device.voiceMessage || 'Sin configurar'} onClick={() => notify('Configura el mensaje de voz del dispensador', 'DIM')} /><SettingRow icon={Tablet} title="Intensidad y vibración" detail="Sin configurar" onClick={() => notify('Esta preferencia estará disponible al conectar el dispositivo', 'DIM')} /></div></>
}

function SettingRow({ icon: Icon, title, detail, connected, onClick }) {
  return <button className="setting-row" onClick={onClick}><div className="setting-icon"><Icon size={19} /></div><span><strong>{title}</strong><small>{detail}</small></span>{connected && <span className="connected-label"><span className="online-dot" /> Activo</span>}<ChevronRight size={17} /></button>
}

function Modal({ type, medication, close, onConfirm }) {
  const actions = {
    travel: { icon: Smartphone, eyebrow: 'MODO FUERA DE CASA', title: 'Prepara tu viaje', text: 'Selecciona las dosis que necesitas llevar. Tu agenda principal seguirá intacta.', confirm: 'Configurar viaje' },
    refill: { icon: Lightbulb, eyebrow: 'ASISTENTE DE RECARGA', title: 'Recargar cartucho #01', text: 'Abriremos el seguro y encenderemos la luz roja para guiarte paso a paso.', confirm: 'Iniciar guía' },
    ocr: { icon: QrCode, eyebrow: 'IMPORTAR RECETA', title: 'Escanea tu fórmula', text: 'Toma una foto clara de la receta. La IA identificará medicamentos y horarios.', confirm: 'Abrir cámara' },
  }
  const data = type === 'medication'
    ? { icon: Pill, eyebrow: 'FICHA DEL MEDICAMENTO', title: medication?.medicationName || 'Medicamento', text: 'Información configurada para este tratamiento.', confirm: 'Cerrar' }
    : actions[type] || { icon: Zap, eyebrow: 'ACCIÓN', title: 'Acción del dispensador', text: 'La operación se realizará cuando esté activa.', confirm: 'Continuar' }

  const Icon = data.icon
  return <div className="modal-backdrop" onMouseDown={close}><div className="modal-card" onMouseDown={(event) => event.stopPropagation()}><button className="modal-close icon-button" onClick={close} aria-label="Cerrar detalle"><X size={19} /></button><div className="modal-icon"><Icon size={24} /></div><p className="eyebrow">{data.eyebrow}</p><h2>{data.title}</h2><p className="modal-text">{data.text}</p>{type === 'medication' && medication && <dl className="medication-detail-list"><div><dt>Compartimento</dt><dd>#{String(medication.slot).padStart(2, '0')}</dd></div><div><dt>Dosis</dt><dd>{medication.dose || 'Sin especificar'}</dd></div><div><dt>Frecuencia</dt><dd>{medication.frequencyHours ? `Cada ${medication.frequencyHours} horas` : 'Sin configurar'}</dd></div><div><dt>Existencias</dt><dd>{Number(medication.amount || 0)} pastillas</dd></div>{medication.notes && <div><dt>Indicaciones</dt><dd>{medication.notes}</dd></div>}</dl>}<button className="primary-button full" onClick={onConfirm}>{data.confirm}{type !== 'medication' && <ChevronRight size={17} />}</button>{type !== 'medication' && <button className="text-button centered" onClick={close}>Cancelar</button>}</div></div>
}

createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>)
