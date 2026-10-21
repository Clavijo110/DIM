# Firmware ESP32-S3

Firmware modular para el carrusel de siete compartimentos, el motor receptor 28BYJ-48, los sensores, el RTC DS3231, la pantalla paralela y el control local desde DIM. El ESP32 compila un solo programa; los servicios separados son modulos de firmware, no microservicios de red independientes.

## Preparar y cargar

1. Instala PlatformIO Core (`python -m pip install platformio`).
2. Copia `include/DeviceSecrets.example.h` como `include/DeviceSecrets.h` y configura allí la red, la clave API local, la clave del AP y la contraseña OTA. `DeviceSecrets.h` está ignorado por Git; no lo publiques.
3. El entorno seleccionado usa el perfil ESP32-S3 DevKitC-1 N8 de 8 MB, que reserva particiones OTA con `default_8MB.csv`. Confirma que el módulo físico tiene 8 MB de flash.
4. Si el firmware instalado aún no ejecuta ArduinoOTA, haz una carga inicial por USB: `python -m platformio run -j 4 -e esp32-s3-devkitc-1 -t upload --upload-port COMx`. Sustituye `COMx` por el puerto correcto.
5. Para actualizar por Wi-Fi, conecta un equipo a la red `Dispensador` (`192.168.4.1`), asigna en PowerShell `$env:DIM_OTA_PASSWORD = '<contraseña OTA vigente del dispositivo>'` y ejecuta `python -m platformio run -j 4 -e esp32-s3-devkitc-1-ota -t upload`. Usa siempre el mismo entorno y no ejecutes `clean`: PlatformIO reutiliza los objetos compilados que no cambiaron. En este equipo, cuatro trabajos paralelos corresponden a los cuatro procesadores lógicos disponibles. La contraseña no se guarda en el repositorio. No uses el monitor serial porque GPIO43/44 son I2C del RTC.

El ESP32 mantiene el AP `Dispensador` en `192.168.4.1` y también se conecta como estación a la Wi‑Fi configurada (por ejemplo, el hotspot del iPhone). La API `/status` informa ambas IP y el nombre local `Dispensador.local`; el teléfono y el dispositivo deben poder comunicarse por su interfaz de estación para compartir internet y llegar a la app. El AP sirve para OTA y control local; no da acceso a Supabase por sí solo. Verifica los niveles lógicos y el cableado antes de conectar motores.

Al iniciar, el firmware referencia primero el carrusel y luego el disco receptor con sus sensores HOME. La agenda automática solo se ejecuta cuando ambos motores y el RTC están listos. Si falla un HOME, comprueba el mecanismo y vuelve a referenciarlo desde DIM antes de esperar una dispensación. Una lectura del DS3231 anterior al 1 de enero de 2025 se considera inválida y no permite dispensar por horario hasta sincronizar el reloj. La hora de agenda usa el desfase local guardado por «Sincronizar RTC»; cuando aún no se ha guardado uno, usa UTC−05:00. El panel muestra la hora local del dispositivo y su UTC offset para compararla con la hora programada.

## Pines configurados

| Funcion | GPIO | Supuesto |
| --- | ---: | --- |
| DRV8825 STEP / DIR / EN | 4 / 5 / 46 | DIR HIGH antihorario; EN activo en bajo. GPIO46 es strap; durante reset puede habilitar el driver si no hay pull-up externo. |
| Sensor HOME carrusel | 21 | HOME según nivel configurado y validado en el montaje. |
| ULN2003 IN1..IN4 | 6, 7, 15, 16 | Secuencia 28BYJ-48 de ocho medios pasos. |
| Sensor HOME del disco | 19 | Nivel activo según la prueba del sensor. |
| Sensor óptico de caída | 20 | Flanco de bajada, `INPUT_PULLUP`; GPIO19/20 dejan de estar disponibles para USB-JTAG. |
| DFPlayer RX/TX del ESP32 | 10 / 11 | RX recibe TX del DFPlayer; TX va a RX del módulo mediante resistencia serie de 1 kΩ. |
| 74HC595 DATA / CLOCK / LATCH | 14 / 12 / 13 | Q0 salida de pastilla; Q1–Q7 compartimentos 1–7. Nivel alto activa la salida del MOSFET. |
| RTC DS3231 SDA / SCL | 44 / 43 | UART0 deshabilitado en firmware para liberar estos GPIO. |
| LCD RS, CS, WR, RST, RD | 47, 8, 18, 9, 17 | Bus paralelo de 8 bits, panel compatible con ILI9341. |
| LCD D0..D7 | 1, 2, 42, 41, 40, 39, 38, 48 | Conserva el orden del sketch LCD recibido. |

La luz Q0 se mantiene encendida 10 s tras una detección y se puede probar desde el panel de la app. Al seleccionar un compartimento en la app se activa su Q1–Q7 correspondiente. El LCD muestra la hora actual y la próxima toma. Desde la app se puede enviar una pista arbitraria del DFPlayer para comprobar el audio; la respuesta solo confirma que la orden serial fue enviada, no que haya sonido. Comparte GND y alimenta motores/luces desde fuentes apropiadas; nunca desde el pin de 3,3 V del ESP32.

## API local

Todas las rutas usan `Authorization: Bearer <DEVICE_API_KEY>` y prefijo `/api/v1`.

| Metodo y ruta | Accion |
| --- | --- |
| `GET /status` | Versión, IP del hotspot STA, IP del AP, posiciones, sensores y hora RTC. |
| `POST /carousel/home` | Busca la referencia optica con limite de pasos. |
| `POST /carousel/position` con `{"position":0}` | Mueve a una posicion absoluta de 0 a 7 por el camino mas corto. |
| `POST /carousel/vibrate` | Vibra 2 s en la posición actual; requiere HOME previo. |
| `POST /carousel/compartment` con `{"compartment":1}` | Prueba el carrusel, el offset de 22,5°, la vibración de 2 s y regresa a HOME. |
| `POST /carousel/test` | Ejecuta la prueba en los siete compartimentos; usar solo sin pastillas. |
| `POST /feeder/home` | Busca la referencia del disco (cavidad grande). |
| `POST /feeder/position` con `{"pillSize":"small"}` | Prueba el giro del disco y su posición cerrada; ejecutar sin medicamentos. |
| `POST /indicators/compartment` con `{"compartment":1}` | Enciende Q1–Q7 para indicar el compartimento seleccionado. |
| `POST /indicators/output` | Enciende la luz Q0 durante 10 s para comprobar la salida. |
| `POST /audio/play` con `{"track":1,"volume":18}` | Envía al DFPlayer la orden para reproducir una pista de la carpeta `01` (1–255; volumen 0–30). |
| `POST /dispense` con `{"compartment":1,"pillSize":"small","pillsPerDose":2}` | Orquesta carrusel, offset, cavidad, vibración, HOME, media vuelta y confirmación por sensor para cada pastilla. |
| `POST /clock` con `{"unixTime":...,"timezoneOffsetMinutes":...}` | Ajusta el DS3231 desde la hora del telefono. Si hay internet, también se sincroniza desde NTP al iniciar y periódicamente; se conserva el desfase local configurado. |
| `POST /schedule` con `{"schedules":[{"compartment":1,"medicationName":"Vitamina D","pillSize":"small","startHour":8,"startMinute":0,"frequencyHours":8,"pillsPerDose":2,"amount":20}]}` | Reemplaza la agenda persistente local. Cada hora inicial es la próxima ocurrencia futura; después se repite el intervalo. Una lista vacía borra la agenda. |
| `POST /schedule/once` con `{"compartment":1,"minutesFromNow":10}` | Programa una toma única en el compartimento indicado, dentro de 1 a 10080 minutos. Requiere que el compartimento ya esté sincronizado en la agenda y tenga existencias. |
| `POST /schedule/once/cancel` | Cancela una toma única pendiente antes de que comience. |

La agenda reside en el ESP32 y requiere un DS3231 válido. Con internet disponible, el RTC se sincroniza con NTP al iniciar y cada seis horas; si falla el primer intento, se reintenta cada 30 segundos hasta sincronizar y recalcular la agenda. También se puede sincronizar desde DIM, que aplica el UTC offset local del teléfono. Después de corregir el reloj por NTP al arrancar, se recalculan las próximas tomas recurrentes a partir de la hora ancla guardada; al sincronizar el RTC desde DIM, el firmware recalcula esas próximas tomas automáticamente. Al calcular una nueva próxima toma o recalcular tras ajustar el reloj, se avanza en intervalos desde la hora de inicio, sin reiniciar el ciclo diario cuando la hora de inicio ya pasó. Si no se puede guardar ese recálculo, la dispensación automática queda pausada y el estado lo indica; vuelve a sincronizar el RTC y la agenda desde DIM. Cada compartimento conserva su horario; frecuencias iguales no se agrupan. La toma única se programa indicando cuántos minutos faltan (1 a 10080); el tiempo restante se calcula con el reloj local del RTC, por lo que el dispositivo debe conservar hora válida y permanecer encendido. Visto desde arriba, el disco ahora avanza en sentido horario: grande está en HOME, pequeña a 90°, mediana a 180° y cerrado a 270°. Para cada pastilla el carrusel lleva el contenedor al punto común, alinea el disco con la cavidad elegida, vuelve al centro y vibra 2 s. Después vuelve a la salida vacía, el disco gira 180° en sentido horario y el sensor de caída debe generar un flanco. El disco intenta volver a cerrado incluso si el sensor no detecta caída; la toma se detiene y bloquea el compartimento sin reintentar. El inventario solo se descuenta si se detectan todas las pastillas de la toma; ante un fallo parcial hay que revisar físicamente la salida y reconciliar existencias antes de desbloquear.

El carrusel usa acople directo 1:1, 200 micropasos por posición de 45° y 100 micropasos por el offset de 22,5°. El motor 28BYJ-48 usa 4096 medios pasos aproximados por vuelta. Verifica en banco la dirección, el ángulo, el sensor de caída y el tiempo de vibración con pastillas ficticias antes de usarlo. El sensor cuenta el evento óptico, pero no puede comprobar atascos posteriores ni ingestión.

## Conectar la app

La app y el teléfono deben poder alcanzar el ESP32 por la red local. Si el teléfono está conectado al hotspot del iPhone, usa en **Mi dispensador** la IP de estación indicada por `/status` o `Dispensador.local`; si el teléfono se conecta directamente al AP del equipo, usa `192.168.4.1`. Para desarrollo inicia Vite escuchando en la LAN, por ejemplo `npm run dev -- --host 0.0.0.0 --port 5175`, y abre esa URL HTTP desde el teléfono. Una app servida por HTTPS no puede llamar directamente a la API HTTP local en navegadores que bloquean contenido mixto; para ese caso se necesita un proxy HTTPS o una app nativa.

El navegador guarda IP y clave localmente. El firmware admite CORS para facilitar la app local; la clave API sigue siendo obligatoria. No expongas el puerto 80 a Internet ni uses la clave de ejemplo.

## Alcance

Los comandos manuales requieren confirmacion en la app; la agenda automatica se ejecuta sin la app abierta. El bloqueo horario de la interfaz no es un interbloqueo fisico del firmware. El sensor de pastilla no confirma que una dosis haya caido o sido ingerida y debe validarse en el montaje real. No uses este prototipo para administrar medicacion: primero se necesitan pruebas mecanicas, electricas, de fallo y regulatorias.
