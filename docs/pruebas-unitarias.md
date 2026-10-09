# Pruebas unitarias

## Ejecución

```powershell
npm.cmd test -- --run
```

## Resumen

| Métrica | Resultado |
| --- | ---: |
| Archivos de prueba | 1 pasado |
| Pruebas | 10 pasadas |
| Fallos | 0 |

## Qué se comprobó — simulaciones por software

| # | Caso | Resultado |
| ---: | --- | :---: |
| 1 | Bloqueo predeterminado de 00:00 a 06:00 y horarios personalizados, incluso si cruzan medianoche | Aprobado |
| 2 | Giro teórico de 45° por posición: recorre los compartimentos 1–8 y vuelve al punto inicial | Aprobado |
| 3 | Reglas de disponibilidad para compartimentos configurados, vacíos o dentro del horario bloqueado | Aprobado |
| 4 | Intervalo de toma válido: número entero entre 1 y 168 horas | Aprobado |
| 5 | Selección del siguiente compartimento disponible y respuesta cuando no hay ninguno | Aprobado |
| 6 | Traducción de errores comunes de autenticación de Supabase | Aprobado |
| 7 | Inicio de cada cuenta con ocho compartimentos vacíos | Aprobado |
| 8 | Timeout cuando una solicitud de Supabase queda pendiente | Aprobado |
| 9 | Resolución de solicitudes correctas y propagación de errores de red | Aprobado |
| 10 | Aplicación del horario personalizado a la disponibilidad del compartimento | Aprobado |

## Archivo de pruebas

Los casos están implementados en [`src/lib/dispenserLogic.test.js`](../src/lib/dispenserLogic.test.js).

## Alcance y pendientes

Las pruebas se ejecutan sobre funciones JavaScript. Las solicitudes de red se simulan: no se conectan a Supabase en vivo, al ESP32, al sensor ni al motor físico. El giro de 45° se comprueba con el cálculo de pasos, no mediante una prueba mecánica.

La revisión de la normativa biomédica aplicable y de la posible clasificación del proyecto como software como dispositivo médico (SaMD) queda pendiente. Estas pruebas no son una validación clínica ni regulatoria.
