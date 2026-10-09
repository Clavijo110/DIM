# Declaración de uso de Inteligencia Artificial

Durante el desarrollo de DIM se utilizó inteligencia artificial generativa como herramienta de apoyo en algunas etapas. Las propuestas se revisaron y adaptaron al proyecto. Las pruebas con hardware físico todavía están pendientes.

| Herramienta | Sección/Milestone | Qué se hizo | Acción tomada |
| --- | --- | --- | --- |
| GitHub Copilot | Autenticación y perfiles | Se recibió apoyo para implementar el registro, el inicio de sesión y la visualización del nombre del usuario. | Se integraron los cambios con Supabase y se comprobaron mediante el build de la aplicación. |
| GitHub Copilot | Base de datos y persistencia | Se recibió apoyo para organizar el esquema de Supabase, separar los datos por usuario y preparar migraciones SQL. | Se añadieron políticas RLS y archivos de migración; estas deben ejecutarse en el proyecto de Supabase. |
| GitHub Copilot | Medicamentos y ajustes | Se añadió la frecuencia de toma en horas y la configuración personal del horario de bloqueo. | Se conectaron los campos con la validación, el guardado y las vistas. La frecuencia todavía no programa el motor. |
| GitHub Copilot | Pruebas unitarias | Se propusieron y ampliaron pruebas para horarios, compartimentos, frecuencias, autenticación y respuestas de red. | Se ejecutó la suite: 10 pruebas pasaron. También se comprobó el build de producción. |
| GitHub Copilot | Firmware | Se prepararon sketches de prueba manual para controlar un motor con DRV8825 desde ESP32 y Arduino Uno. | Se revisó el código; la compilación con Arduino y las pruebas físicas del hardware siguen pendientes. |
| GitHub Copilot | Documentación | Se organizaron diagramas de flujo con Mermaid y documentos de arquitectura y resultados de pruebas. | Se revisaron los textos y diagramas para que reflejen el estado actual del proyecto. |
