#pragma once

#include <Arduino.h>
#include "DeviceSecrets.h"
#include "PillSize.h"

namespace DeviceConfig {
constexpr uint8_t CAROUSEL_STEP_PIN = 4;
constexpr uint8_t CAROUSEL_DIR_PIN = 5;
constexpr uint8_t CAROUSEL_ENABLE_PIN = 46;
constexpr uint8_t CAROUSEL_HOME_PIN = 21;
constexpr uint8_t FEEDER_IN1_PIN = 6;
constexpr uint8_t FEEDER_IN2_PIN = 7;
constexpr uint8_t FEEDER_IN3_PIN = 15;
constexpr uint8_t FEEDER_IN4_PIN = 16;
constexpr uint8_t FEEDER_HOME_PIN = 19;
constexpr uint8_t PILL_SENSOR_PIN = 20;
// GPIO43 (TX) / GPIO44 (RX) = UART0: consola serial y carga de firmware.
// El RTC DS3231 se retiró; la hora viene de NTP o de la app (POST /clock).
constexpr uint32_t SERIAL_BAUD = 115200;
constexpr uint8_t INDICATOR_DATA_PIN = 14;
constexpr uint8_t INDICATOR_CLOCK_PIN = 12;
constexpr uint8_t INDICATOR_LATCH_PIN = 13;
constexpr uint8_t DFPLAYER_RX_PIN = 11;
constexpr uint8_t DFPLAYER_TX_PIN = 10;

constexpr uint8_t LCD_RS_PIN = 47;
constexpr uint8_t LCD_CS_PIN = 8;
constexpr uint8_t LCD_WR_PIN = 18;
constexpr uint8_t LCD_RST_PIN = 9;
constexpr uint8_t LCD_RD_PIN = 17;
constexpr uint8_t LCD_DATA_PINS[8] = {1, 2, 42, 41, 40, 39, 38, 48};

constexpr uint8_t CAROUSEL_POSITION_COUNT = 8;
constexpr uint8_t MEDICATION_COMPARTMENT_COUNT = 7;
constexpr uint8_t CAROUSEL_DIR_ANTICLOCKWISE = HIGH;
constexpr uint8_t CAROUSEL_DIR_CLOCKWISE = LOW;
constexpr uint16_t CAROUSEL_STEPS_PER_POSITION = 200;
constexpr uint16_t CAROUSEL_STEPS_PER_REVOLUTION =
    CAROUSEL_POSITION_COUNT * CAROUSEL_STEPS_PER_POSITION;
constexpr uint8_t CAROUSEL_HOME_BLOCKED_LEVEL = HIGH;
constexpr uint16_t CAROUSEL_PULSE_HIGH_US = 5;
constexpr uint16_t CAROUSEL_START_DELAY_US = 4500;
constexpr uint16_t CAROUSEL_CRUISE_DELAY_US = 2000;
constexpr uint16_t CAROUSEL_SEARCH_DELAY_US = 3000;
constexpr uint8_t CAROUSEL_RAMP_STEPS = 40;
constexpr uint16_t CAROUSEL_VIBRATION_DURATION_MS = 2000;
constexpr uint8_t CAROUSEL_VIBRATION_AMPLITUDE_STEPS = 12;
constexpr uint16_t CAROUSEL_ALIGNMENT_OFFSET_STEPS = CAROUSEL_STEPS_PER_POSITION / 2;
constexpr uint16_t CAROUSEL_VIBRATION_DELAY_US = 1300;
constexpr uint16_t CAROUSEL_HOME_CONFIRMATION_MS = 4;
constexpr uint8_t CAROUSEL_HOME_BACKOFF_STEPS = 15;
constexpr uint16_t CAROUSEL_COMPARTMENT_PAUSE_MS = 800;
// Regreso al hueco: este porcentaje del trayecto va rápido y el resto busca HOME.
constexpr uint8_t CAROUSEL_RETURN_FAST_PERCENT = 85;
// Pasos extra para llegar siempre girando hacia adelante (juego de la reductora).
constexpr uint8_t FEEDER_BACKLASH_STEPS = 64;
constexpr uint16_t PILL_DROP_WINDOW_MS = 1500;
constexpr uint8_t DISPENSE_MAX_ATTEMPTS = 3;
// Pistas de la carpeta 01 de la SD del DFPlayer.
constexpr uint16_t AUDIO_TRACK_PILL_DISPENSED = 1;
constexpr uint16_t AUDIO_TRACK_DISPENSE_ERROR = 2;
constexpr uint8_t AUDIO_VOLUME = 18;
constexpr uint8_t FEEDER_HOME_LEVEL = HIGH;
constexpr uint8_t PILL_DETECTED_LEVEL = LOW;
constexpr uint16_t FEEDER_STEPS_PER_REVOLUTION = 4096;
constexpr uint16_t FEEDER_STEPS_PER_QUARTER_TURN = FEEDER_STEPS_PER_REVOLUTION / 4;
constexpr int16_t DEFAULT_TIMEZONE_OFFSET_MINUTES = -300;
constexpr uint32_t PILL_DETECTION_TIMEOUT_MS = 10000;
constexpr uint32_t OUTPUT_LIGHT_DURATION_MS = 10000;
constexpr uint8_t FEEDER_LARGE_POSITION = 0;
// Cuartos de vuelta desde HOME girando hacia adelante (horario). Cerrado = 90° horario.
constexpr uint8_t FEEDER_CLOSED_POSITION = 1;
constexpr uint8_t FEEDER_MEDIUM_POSITION = 2;
constexpr uint8_t FEEDER_SMALL_POSITION = 3;
}