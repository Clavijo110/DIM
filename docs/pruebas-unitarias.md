# Pruebas unitarias

## Ejecución

```powershell
npm.cmd test -- --run
```

## Resumen

| Métrica | Resultado |
| --- | ---: |
| Archivos de prueba | 1 |
| Pruebas | 9 completadas |
| Fallos | 0 |
| Duración total registrada | 526 ms |

## Casos verificados - Simulación de errores por software

| # | Caso | Resultado |
| ---: | --- | :---: |
| 1 | Bloqueo del dispensador en horarios personalizados | Aprobado |
| 2 | Giro cada 45°, pasa por 8 compartimentos y regresa al compartimento 1 | Aprobado |
| 3 | Disponibilidad del compartimento según su estado, existencias y horario configurado | Aprobado |
| 4 | Frecuencia de toma de pastillas en un rango de 1 a 168 horas | Aprobado |
| 5 | Selección del siguiente compartimento y ausencia de resultado cuando ninguno está disponible | Aprobado |
| 6 | Traducción de errores comunes de autenticación de Supabase | Aprobado |
| 7 | Inicio de cada cuenta con ocho compartimentos vacíos | Aprobado |
| 8 | Timeout cuando una solicitud de Supabase queda pendiente | Aprobado |
| 9 | Resolución de solicitudes correctas y propagación de errores de red | Aprobado |

## Archivo de pruebas

Los casos están implementados en [`src/lib/dispenserLogic.test.js`](../src/lib/dispenserLogic.test.js).
