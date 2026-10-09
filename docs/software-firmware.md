# Software y firmware DIM

## Alcance y estado

Este documento describe los flujos que implementa actualmente el repositorio. La aplicacion web guarda perfiles, compartimentos, ajustes, notificaciones y eventos por usuario en Supabase. Los sketches DRV8825 son pruebas manuales de movimiento; no reciben ordenes desde la app ni dispensan medicamentos automaticamente.

La frecuencia guardada por medicamento es un intervalo informativo en horas (1-168). No crea alarmas ni programa el motor. Cada usuario puede elegir en Ajustes el horario en el que la app marca los compartimentos como no disponibles. Es una regla de software; no detiene fisicamente el motor. El firmware servo actual usa `millis()` como si fuera hora real y no debe usarse para controlar dosis.

## Arquitectura actual

```mermaid
flowchart LR
    Browser[React y Vite<br/>src/main.jsx] --> Logic[Logica de compartimentos<br/>src/lib/dispenserLogic.js]
    Browser --> Client[Cliente Supabase<br/>src/lib/supabase.js]
    Client --> Auth[Supabase Auth]
    Client --> REST[Supabase REST API]
    REST --> DB[(Postgres\nRLS por user_id)]
    Stepper[Sketch de prueba DRV8825\nESP32 o Arduino Uno] --> Motor[Motor paso a paso]
    Legacy[Sketch ESP32 con servo\nprototipo legacy] --> Servo[Servo y buzzer]
    Stepper -. no conectado a DIM web .-> Browser
    Legacy -. no lee la frecuencia ni la configuracion web .-> REST
```

## Flujo de inicio y autenticacion

```mermaid
flowchart TD
    Start([Abrir DIM]) --> Config{URL y clave anon configuradas?}
    Config -- No --> ConfigError[Mostrar error de configuracion]
    Config -- Si --> Session[Recuperar sesion Supabase\nlimite 10 s]
    Session --> HasSession{Sesion valida?}
    HasSession -- No --> Login[Mostrar login / registro]
    Login --> Action{Accion del usuario}
    Action -- Crear cuenta --> SignUp[Supabase Auth signUp]
    SignUp --> Confirm{Supabase requiere confirmar email?}
    Confirm -- Si --> CheckMail[Informar que revise el correo]
    Confirm -- No --> Login
    Action -- Iniciar sesion --> SignIn[Supabase Auth signInWithPassword]
    SignIn --> AuthOK{Autenticacion correcta?}
    AuthOK -- No --> AuthError[Mostrar error recuperable]
    AuthError --> Login
    AuthOK -- Si --> Profile
    HasSession -- Si --> Profile[Cargar perfil del usuario]
    Profile --> Data[Consultar datos con user_id y RLS\nlimite 12 s]
    Data --> Empty{Hay medicamentos activos?}
    Empty -- No --> Guide[Mostrar guia de primeros pasos]
    Empty -- Si --> Dashboard[Mostrar Inicio y plan guardado]
    Guide --> Dashboard
```

## Flujo de alta o modificacion de medicamento

```mermaid
flowchart TD
    Start([Abrir Mi dispensador]) --> Select[Elegir compartimento 1-8]
    Select --> Form[Introducir medicamento, dosis, frecuencia y cantidad]
    Form --> Validate{Nombre, cantidad y frecuencia\nvalida de 1 a 168 h?}
    Validate -- No --> ValidationError[Mostrar indicacion del campo pendiente]
    ValidationError --> Form
    Validate -- Si --> Save[Upsert de compartimentos\ncon user_id y slot]
    Save --> Saved{Supabase guardo?}
    Saved -- No --> SaveError[Mostrar error; conservar formulario]
    Saved -- Si --> Changed{Cambio nuevo o sin evento previo?}
    Changed -- Si --> Event[Insertar dispense_event\ncon usuario, slot, nombre y fecha]
    Changed -- No --> UI[Actualizar estado visible]
    Event --> EventOK{Evento registrado?}
    EventOK -- Si --> UI[Actualizar estado visible]
    EventOK -- No --> Partial[Indicar que se guardo medicamento\npero fallo el historial]
    Partial --> UI
    UI --> Treatments[Mostrar frecuencia e inventario\nen Tratamientos]
    UI --> History[Mostrar actividad en Historial]
```

## Flujo del sketch de prueba DRV8825

```mermaid
flowchart TD
    Power([Encender placa]) --> Pins[Configurar pines del driver]
    Pins --> Microstep[Seleccionar cuarto de paso\nM0 LOW, M1 HIGH, M2 LOW]
    Microstep --> Enable[RESET y SLEEP HIGH\nesperar 2 ms, habilitar EN]
    Enable --> Assume[Asumir posicion fisica actual = slot 1]
    Assume --> Serial[Esperar comando serial]
    Serial --> Command{Comando}
    Command -- 1..8 --> Target[Calcular avance horario modulo 8]
    Target --> Steps[Avanzar 100 micropasos por compartimento]
    Steps --> Serial
    Command -- n --> Next[Avanzar un compartimento]
    Next --> Serial
    Command -- r --> Revolution[Avanzar 800 micropasos]
    Revolution --> Serial
    Command -- z --> Zero[Marcar posicion actual como slot 1\nno mueve el motor]
    Zero --> Serial
    Command -- otro --> Serial
```

Con un motor de 200 pasos completos por vuelta, cuarto de paso produce 800 micropasos por vuelta. Ocho posiciones uniformes requieren 100 micropasos (45 grados) por compartimento. La velocidad configurada es una referencia; el tiempo real depende del motor, corriente, carga y fuente.

## Modulos y ubicacion del codigo

| Modulo | Codigo actual | Responsabilidad |
| --- | --- | --- |
| Interfaz y flujo de pantallas | [`src/main.jsx`](../src/main.jsx) | Auth, estado de sesion, onboarding, configuracion y vistas. |
| Acceso a Supabase | [`src/lib/supabase.js`](../src/lib/supabase.js) | Auth, consultas por usuario, guardado de compartimentos y eventos. |
| Reglas locales | [`src/lib/dispenserLogic.js`](../src/lib/dispenserLogic.js) | Angulos, disponibilidad y bloqueo nocturno. |
| Esquema de base | [`database/schema.sql`](../database/schema.sql) | Tablas, claves y politicas RLS. |
| Migraciones | [`database/migrate_user_scoping.sql`](../database/migrate_user_scoping.sql), [`database/migrate_medication_frequency.sql`](../database/migrate_medication_frequency.sql) | Actualizacion de proyectos Supabase ya creados. |
| Prueba de motor para ESP32 | [`esp32/motor_paso_a_paso_drv8825.ino`](../esp32/motor_paso_a_paso_drv8825.ino) | Control manual serial del DRV8825; sin sensor ni agenda automatica. |
| Prototipo ESP32 con servo | [`esp32/dispensador_esp32.ino`](../esp32/dispensador_esp32.ino) | Prototipo separado; requiere correcciones antes de uso real. |
| Prueba de motor para Uno | [`arduino_uno/motor_drv8825_arduino_uno.ino`](../arduino_uno/motor_drv8825_arduino_uno.ino) | Control manual serial del DRV8825 en Arduino Uno. |
| Pruebas web | [`src/lib/dispenserLogic.test.js`](../src/lib/dispenserLogic.test.js) | Reglas de compartimentos, ventana nocturna y utilidades. |

## Estructura recomendada del repositorio

Mantener una sola fuente de verdad: la aplicacion en `src/`, SQL en `database/`, documentacion en `docs/` y firmware separado por placa. No copiar implementaciones completas dentro de la documentacion; los diagramas explican los flujos y los archivos de firmware contienen el codigo ejecutable.

```text
DIM/
  docs/
    software-firmware.md
  src/
    main.jsx
    lib/
      supabase.js
      dispenserLogic.js
  database/
    schema.sql
    migrate_user_scoping.sql
    migrate_medication_frequency.sql
  firmware/
    esp32/
      drv8825_test/
        drv8825_test.ino
      servo_prototype/
        servo_prototype.ino
    arduino_uno/
      drv8825_test/
        drv8825_test.ino
  .env.example
  .gitignore
  package.json
```

La estructura anterior es una propuesta, no una reubicacion automatica de los archivos actuales. Arduino IDE suele trabajar mas claramente cuando cada sketch tiene su propia carpeta y el `.ino` principal comparte el nombre de esa carpeta. Mantener sketches de placas distintas separados evita cargar por error el programa incorrecto.

## Seguridad y pasos pendientes

- No subir `.env`, claves privadas ni contrasenas de Wi-Fi al repositorio. Para Vite solo debe exponerse la clave anonima; nunca una `service_role`.
- Ejecutar las migraciones SQL en el proyecto Supabase antes de usar las columnas `user_id` y `frequency_hours`.
- `esp32/dispensador_esp32.ino` contiene valores de ejemplo, usa tiempo desde arranque como reloj y hace una accion de prueba al iniciar. No es firmware clinico ni debe conectarse a un dispensador real sin RTC, autenticacion por dispositivo, lectura de configuracion, limites y validacion fisica.
- Los sketches DRV8825 solo aceptan comandos manuales por Serial. No consultan Supabase, no calculan proximas dosis y no deben considerarse un sistema de dispensacion automatica.
- El horario personalizado se valida en la app, pero aun no se sincroniza con el firmware ni bloquea el motor fisicamente.
- La clasificacion regulatoria y la normativa biomedica aplicable, incluida la posible categoria SaMD, deben revisarse antes de cualquier uso clinico.
- Validacion web del repositorio: `npm test` y `npm run build`. Para compilar firmware se necesita Arduino IDE o Arduino CLI, la placa correcta y las librerias correspondientes.
