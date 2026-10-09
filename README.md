# DIM — Dispensador Inteligente de Medicamentos

DIM es una aplicación web para organizar medicamentos por compartimento y consultar el inventario de un dispensador de ocho posiciones. Incluye autenticación de usuarios, persistencia en Supabase, un historial de cambios y pruebas manuales de motor con DRV8825.

> **Estado del hardware:** la aplicación web y los sketches de motor todavía no están conectados entre sí. Los sketches DRV8825 se controlan manualmente por el monitor serial. No se debe usar este proyecto para dispensar medicamentos automáticamente ni como sustituto de indicaciones profesionales.

## Funciones disponibles

- Registro e inicio de sesión con correo y contraseña mediante Supabase Auth.
- Perfil con nombre y correo del usuario.
- Configuración individual de ocho compartimentos: medicamento, dosis, frecuencia informativa y existencias.
- Frecuencia configurable en horas enteras, de 1 a 168. Actualmente se guarda y se muestra, pero no genera una agenda ni activa el motor.
- Horario de bloqueo configurable por usuario. La aplicación marca los compartimentos como no disponibles durante ese intervalo; todavía no bloquea físicamente un motor.
- Inicio guiado, lista de tratamientos e historial de altas y modificaciones.
- Pruebas unitarias de reglas de horarios, posiciones, disponibilidad, frecuencia y manejo de errores.

## Requisitos

- Node.js y npm.
- Un proyecto Supabase para utilizar autenticación y persistencia en la nube.
- Para probar el firmware: Arduino IDE o Arduino CLI, una placa compatible, la librería `AccelStepper` para DRV8825 y el hardware conectado correctamente.

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

1. En Supabase, habilita el proveedor de autenticación por correo.
2. En la configuración de URL de Auth, agrega la dirección local que uses, por ejemplo `http://localhost:5175` y `http://localhost:5175/**`.
3. Para un proyecto nuevo, ejecuta [`database/schema.sql`](database/schema.sql) en SQL Editor.
4. Para una base existente con el esquema anterior, ejecuta [`database/migrate_user_scoping.sql`](database/migrate_user_scoping.sql) y [`database/migrate_medication_frequency.sql`](database/migrate_medication_frequency.sql) en SQL Editor.

La migración de separación por usuario elimina filas compartidas antiguas que no tienen propietario; revisa y respalda esos datos antes de aplicarla si necesitas conservarlos.

## Ejecutar y comprobar

```powershell
npm run dev -- --port 5175
npm test
npm run build
```

La aplicación estará disponible en `http://localhost:5175/`. Si utilizas otro puerto, configura también esa URL en Supabase Auth.

La suite contiene pruebas unitarias de la lógica de horarios, compartimentos, frecuencias y manejo de errores:

```powershell
npm test
```

Estas pruebas simulan fechas y respuestas de red. No se conectan a Supabase en vivo ni al sensor, al motor o al dispensador físico.

## Firmware de prueba

- [`arduino_uno/motor_drv8825_arduino_uno.ino`](arduino_uno/motor_drv8825_arduino_uno.ino): prueba manual para Arduino Uno.
- [`esp32/motor_paso_a_paso_drv8825.ino`](esp32/motor_paso_a_paso_drv8825.ino): prueba manual para ESP32.
- [`esp32/dispensador_esp32.ino`](esp32/dispensador_esp32.ino): prototipo anterior con servo; requiere revisión y no está integrado con el flujo actual de la aplicación.

Los sketches con DRV8825 usan cuarto de paso y aceptan comandos desde Serial a 115200 baudios. Consulta los comentarios del sketch para el mapa de pines y verifica la alimentación y el límite de corriente antes de conectar el motor. Sin sensor de referencia, la posición inicial se asume manualmente.

## Seguridad y alcance

DIM es un prototipo académico; no es un dispositivo médico validado. La frecuencia se guarda como dato informativo y el horario personalizado solo determina la disponibilidad en la aplicación: no activa ni detiene físicamente el motor. Antes de cualquier uso clínico, se deben validar el hardware y su integración, y revisar la normativa biomédica aplicable y la posible clasificación como software como dispositivo médico (SaMD).

## Documentación

- [Software, firmware y diagramas Mermaid](docs/software-firmware.md)
- [Pruebas unitarias](docs/pruebas-unitarias.md)
- [Declaración de uso de IA](USO-IA.md)
