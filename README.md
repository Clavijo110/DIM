# DIM — Dispensador Inteligente de Medicamentos

DIM es una aplicación Android y web para organizar medicamentos en siete compartimentos y controlar localmente un dispensador ESP32-S3 con ocho posiciones angulares, incluida la salida de dispensación en la posición 0. La app Android usa Capacitor y conserva la interfaz React; incluye autenticación, persistencia en Supabase, historial y controles de hardware por Wi-Fi.

> **Estado del hardware:** existe una integración local HTTP para pruebas manuales. La orientación del carrusel, el detector de paso de pastilla y el comportamiento mecánico deben calibrarse y validarse en el dispositivo real. No se debe usar este prototipo para administrar medicamentos ni como sustituto de indicaciones profesionales.

## Funciones disponibles

- Registro e inicio de sesión con correo y contraseña; la contraseña se recupera con un enlace de correo mediante Supabase Auth. No se piden usuarios ni números de celular.
- Perfil con nombre y correo del usuario.
- Configuración individual de siete compartimentos: dosis entera y unidad (mg predeterminada; µg, g o UI), tamaño de pastilla, cantidad por toma, hora de inicio, intervalo e inventario.
- Controles locales del ESP32-S3: referencia y posición del carrusel, selección de cavidad por tamaño, sensor de caída, luces indicadoras, sincronización RTC y dispensación con confirmación.
- Agenda recurrente local en el ESP32: tras sincronizar hora y agenda, dispensa desde la hora inicial y repite cada 1–168 horas aunque se cierre la app.
- Horario de bloqueo configurable por usuario. La aplicación marca los compartimentos como no disponibles durante ese intervalo; todavía no bloquea físicamente un motor.
- Inicio guiado, lista de tratamientos e historial de altas y modificaciones.
- Pruebas unitarias de reglas de horarios, posiciones, disponibilidad, frecuencia y manejo de errores.

## Requisitos

- Node.js y npm.
- Un proyecto Supabase para utilizar autenticación y persistencia en la nube.
- Para compilar el firmware modular: PlatformIO, una ESP32-S3 y las librerías declaradas en `firmware/esp32s3/dispensador/platformio.ini`.
- Para compilar la app Android: JDK 21, Android SDK 36 y Android Build Tools 36.

## Instalación local

```powershell
git clone https://github.com/Clavijo110/DIM.git
cd DIM
npm install
Copy-Item .env.example .env
```

Edita `.env` y completa las credenciales públicas del proyecto Supabase:

```env
VITE_SUPABASE_URL=https://TU-PROYECTO.supabase.co
VITE_SUPABASE_ANON_KEY=TU_CLAVE_ANON
```

No pongas una clave `service_role` en variables `VITE_` ni en código que llegue al navegador. No subas `.env` al repositorio.

## Configuración de Supabase

1. En **Authentication > Providers > Email**, habilita el proveedor de correo.
2. En **Authentication > URL Configuration**, agrega `http://localhost:5175/` a las URLs de redirección permitidas y agrega la URL de producción cuando la tengas.
3. Para un proyecto nuevo, ejecuta [`database/schema.sql`](database/schema.sql) en SQL Editor.
4. Para una base existente, ejecuta las migraciones necesarias para la versión que ya tiene: [`database/migrate_user_scoping.sql`](database/migrate_user_scoping.sql), [`database/migrate_medication_frequency.sql`](database/migrate_medication_frequency.sql), [`database/migrate_medication_schedule.sql`](database/migrate_medication_schedule.sql), [`database/migrate_medication_pills_per_dose.sql`](database/migrate_medication_pills_per_dose.sql) y [`database/migrate_medication_pill_size.sql`](database/migrate_medication_pill_size.sql), si todavía no las aplicaste.

La app usa Supabase Auth directamente para crear cuenta, iniciar sesión y pedir el correo de recuperación. **No necesitas desplegar Edge Functions ni guardar `SUPABASE_SERVICE_ROLE_KEY`.**

Para programar dispensación física, actualiza y carga el firmware ESP32, guarda los medicamentos, conecta el dispositivo, sincroniza el RTC y pulsa **Sincronizar agenda automática** en **Mi dispensador**. La cantidad de pastillas por toma se dispensa en cada horario y se resta del inventario; debe haber existencias para cubrir una toma completa. El ESP32 conserva la agenda y el inventario local aunque la app se cierre. Un evento que lleve más de cinco minutos de retraso se omite; los fallos de hardware o una dosis incierta bloquean ese compartimento hasta revisar el mecanismo y el stock y volver a sincronizar. Al reconectar la app, el stock local del ESP32 actualiza Supabase.

El correo predeterminado de Supabase sirve para pruebas, pero solo envía a direcciones autorizadas del equipo del proyecto y tiene límites estrictos. Para enviar mensajes a otros usuarios, configura SMTP personalizado en Supabase. Puedes usar [Resend](https://resend.com), pero Resend pide verificar un dominio que controles; si no tienes dominio, no configures Resend y usa el correo de prueba de Supabase para probar con tu propia dirección autorizada. No añadas usuarios como miembros del equipo solo para permitirles recibir mensajes.

Si anteriormente ejecutaste la migración que añadía las columnas de usuario o celular al perfil, puedes limpiar esas columnas ejecutando [`database/migrate_email_auth.sql`](database/migrate_email_auth.sql) en SQL Editor. Este paso es opcional para cuentas nuevas y elimina `profiles.username`, `profiles.username_normalized` y `profiles.phone`. Las cuentas que se crearon solo con teléfono necesitan primero un correo asociado y confirmado en Supabase Auth; no podrán iniciar sesión por correo mientras no lo tengan.

## Ejecutar y comprobar

```powershell
npm run dev -- --port 5175
npm test
npm run build
```

La versión web estará disponible en `http://localhost:5175/`. Si utilizas otro puerto, configura también esa URL en Supabase Auth.

## App Android

Conecta el teléfono con depuración USB autorizada e instala Android SDK/JDK. Para compilar e instalar la app de depuración:

```powershell
npm run android:install
```

Para generar solamente el APK, ejecuta `npm run android:apk`. El archivo queda en `android/app/build/outputs/apk/debug/app-debug.apk`. La app instalada abre como aplicación nativa y no depende del navegador; el control del ESP32 requiere que ambos estén en la misma red local.

La suite contiene pruebas unitarias de la lógica de horarios, compartimentos, frecuencias y manejo de errores:

```powershell
npm test
```

Estas pruebas simulan fechas y respuestas de red. No se conectan a Supabase en vivo ni al sensor, al motor o al dispensador físico.

## Firmware y control local

El proyecto modular para el montaje ESP32-S3 está en [`firmware/esp32s3/dispensador`](firmware/esp32s3/dispensador/README.md). Expone una API HTTP local protegida y contempla carga OTA por el punto de acceso del dispositivo. La secuencia de dispensación se detiene ante una falta de detección y no reintenta automáticamente.

Los sketches de pruebas anteriores se conservaron en [`firmware/arduino_uno`](firmware/arduino_uno) y [`firmware/legacy_esp32`](firmware/legacy_esp32). No forman parte del firmware integrado.

Los registros antiguos del compartimento 08 se conservan en Supabase, pero la app ya no los muestra ni los envía al hardware de siete compartimentos.

Para controlar el hardware desde un teléfono, conecta la app y el ESP32 a la misma Wi-Fi, inicia Vite escuchando en la LAN (`npm run dev -- --host 0.0.0.0 --port 5175`) y abre esa URL desde el teléfono. En **Mi dispensador**, configura la IP y la clave local. El modo AP de respaldo del ESP32 no ofrece conexión a Supabase. Una app servida por HTTPS necesita un proxy HTTPS o una app nativa para evitar el bloqueo de solicitudes HTTP locales.

El ciclo físico solo debe probarse sin pastillas hasta verificar la alineación. Para el pinout, mapa de compartimentos, comandos de compilación y limitaciones de seguridad, consulta el README del firmware.

## Seguridad y alcance

DIM es un prototipo académico; no es un dispositivo médico validado. La agenda puede accionar el motor automáticamente en el firmware, pero el hardware no confirma de forma fiable la caída ni la ingestión de la pastilla, y el historial de eventos automáticos no sustituye un registro clínico. Antes de cargar medicamentos, valida el mecanismo sin pastillas y comprueba reloj, posiciones, inventario, fallos y recuperación. No se debe usar el prototipo para administrar medicamentos ni sustituir indicaciones profesionales; revisa la normativa biomédica aplicable y la posible clasificación como software como dispositivo médico (SaMD).

## Documentación

- [Software, firmware y diagramas Mermaid](docs/software-firmware.md)
- [Pruebas unitarias](docs/pruebas-unitarias.md)
- [Declaración de uso de IA](USO-IA.md)
