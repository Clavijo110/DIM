# Pruebas unitarias

## Ejecución

```powershell
npm.cmd test -- --run
```

## Resumen

| Métrica | Resultado |
| --- | ---: |
| Archivos de prueba | 1 pasado |
| Pruebas | 9 pasadas |
| Fallos | 0 |
| Duración total registrada | 565 ms |

## Casos verificados

| # | Caso | Resultado |
| ---: | --- | :---: |
| 1 | Bloqueo nocturno exacto desde medianoche hasta las 05:59 | Aprobado |
| 2 | Ángulos de 45°, compartimentos 1–8 y vuelta circular al compartimento 1 | Aprobado |
| 3 | Rechazo de compartimentos inexistentes, vacíos o bloqueados por horario | Aprobado |
| 4 | Frecuencia entera dentro del rango de 1 a 168 horas | Aprobado |
| 5 | Selección del siguiente compartimento y ausencia de resultado cuando ninguno está disponible | Aprobado |
| 6 | Traducción de errores comunes de autenticación de Supabase | Aprobado |
| 7 | Inicio de cada cuenta con ocho compartimentos vacíos | Aprobado |
| 8 | Timeout cuando una solicitud de Supabase queda pendiente | Aprobado |
| 9 | Resolución de solicitudes correctas y propagación de errores de red | Aprobado |

## Archivo de pruebas

Los casos están implementados en [`src/lib/dispenserLogic.test.js`](../src/lib/dispenserLogic.test.js).
