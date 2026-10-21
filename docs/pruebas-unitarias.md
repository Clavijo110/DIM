# Pruebas unitarias

## Ejecución

```powershell
npm.cmd test -- --run
```

## Resumen

| Métrica | Resultado |
| --- | ---: |
| Archivos de prueba | 2 |
| Casos automatizados | 16 |
| Ejecución en este entorno | Pendiente: no están disponibles Node.js ni npm |

## Qué se comprobó — simulaciones por software

| # | Caso | Cobertura |
| ---: | --- | :---: |
| 1 | Bloqueo predeterminado de 00:00 a 06:00 y horarios personalizados, incluso si cruzan medianoche | Implementado |
| 2 | Giro teórico de 45° por posición: siete compartimentos y ocho posiciones físicas | Implementado |
| 3 | Reglas de disponibilidad para compartimentos configurados, vacíos o dentro del horario bloqueado | Implementado |
| 4 | Intervalo de toma válido: número entero entre 1 y 168 horas | Implementado |
| 5 | Selección del siguiente compartimento disponible y respuesta cuando no hay ninguno | Implementado |
| 6 | Traducción de errores comunes de autenticación de Supabase | Implementado |
| 7 | Inicio de cada cuenta con siete compartimentos vacíos | Implementado |
| 8 | Timeout cuando una solicitud de Supabase queda pendiente | Implementado |
| 9 | Resolución de solicitudes correctas y propagación de errores de red | Implementado |
| 10 | Aplicación del horario personalizado a la disponibilidad del compartimento | Implementado |
| 11 | Normalización de la URL local del ESP32 | Implementado |
| 12 | Rechazo de posiciones de carrusel y compartimentos fuera de rango | Implementado |
| 13 | Envío de la orden explícita de dispensación | Implementado |
| 14 | Sincronización de la hora y zona horaria del teléfono | Implementado |
| 15 | Manejo de errores HTTP devueltos por el dispositivo | Implementado |

## Archivo de pruebas

Los casos están implementados en [`src/lib/dispenserLogic.test.js`](../src/lib/dispenserLogic.test.js) y [`src/lib/deviceApi.test.js`](../src/lib/deviceApi.test.js).

## Alcance y pendientes

Las pruebas se ejecutan sobre funciones JavaScript. Las solicitudes de red se simulan: no se conectan a Supabase en vivo, al ESP32, al sensor ni al motor físico. El giro de 45° se comprueba con el cálculo de pasos, no mediante una prueba mecánica.

La revisión de la normativa biomédica aplicable y de la posible clasificación del proyecto como software como dispositivo médico (SaMD) queda pendiente. Estas pruebas no son una validación clínica ni regulatoria.
