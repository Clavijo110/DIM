#include <Arduino.h>
#include <ArduinoOTA.h>
#include <WiFi.h>
#include "AudioService.h"
#include "CarouselService.h"
#include "ClockService.h"
#include "DeviceApi.h"
#include "DeviceConfig.h"
#include "DispenseService.h"
#include "DisplayService.h"
#include "FeederService.h"
#include "IndicatorService.h"
#include "SensorService.h"
#include "ScheduleService.h"
#include "SerialConsole.h"

namespace {
CarouselService carousel;
FeederService feeder;
SensorService sensors;
ClockService clockService;
DisplayService display;
IndicatorService indicators;
AudioService audio;
DispenseService dispenser(carousel, feeder, sensors, indicators, audio, display, Serial);
ScheduleService schedules;
DeviceApi api(carousel, feeder, sensors, clockService, schedules, dispenser, indicators, audio);
SerialConsole console(Serial, carousel, feeder, sensors, indicators, audio, dispenser, clockService);
uint32_t lastDisplayUpdate = 0;
uint32_t lastNetworkRetry = 0;
// Cada WiFi.begin() escanea e interrumpe el AP "Dispensador"; se reintenta poco
// y nunca durante una carga OTA.
constexpr uint32_t NETWORK_RETRY_INTERVAL_MS = 60000;
bool otaInProgress = false;
constexpr uint32_t CLOCK_SYNC_RETRY_INTERVAL_MS = 30UL * 1000UL;
constexpr uint32_t CLOCK_SYNC_INTERVAL_MS = 6UL * 60UL * 60UL * 1000UL;
uint32_t lastClockSyncAttempt = 0;
uint32_t lastSuccessfulClockSync = 0;
bool networkClockSynchronized = false;
bool schedulesRebasedToNetworkTime = false;

void synchronizeClockIfReady() {
  if (!clockService.synchronizeFromNetwork()) return;
  lastSuccessfulClockSync = millis();
  networkClockSynchronized = true;
  if (!schedulesRebasedToNetworkTime) {
    schedulesRebasedToNetworkTime =
        schedules.rebase(clockService.localNow().unixtime());
  }
}

void connectNetwork() {
  // AP "Dispensador" (192.168.4.1) + estación al hotspot de DeviceSecrets.h.
  WiFi.mode(WIFI_AP_STA);
  WiFi.setSleep(false);
  const IPAddress apAddress(192, 168, 4, 1);
  const IPAddress apSubnet(255, 255, 255, 0);
  WiFi.softAPConfig(apAddress, apAddress, apSubnet);
  WiFi.softAP("Dispensador", DeviceConfig::FALLBACK_AP_PASSWORD);
  const bool credentialsConfigured = strcmp(DeviceConfig::WIFI_SSID, "CONFIGURA_TU_WIFI") != 0;
  if (credentialsConfigured) {
    Serial.printf("Wi-Fi: conectando a \"%s\"...\n", DeviceConfig::WIFI_SSID);
    WiFi.begin(DeviceConfig::WIFI_SSID, DeviceConfig::WIFI_PASSWORD);
    for (uint8_t attempt = 0; attempt < 30 && WiFi.status() != WL_CONNECTED; ++attempt) delay(500);
    if (WiFi.status() == WL_CONNECTED) {
      Serial.printf("Wi-Fi: conectado. IP del dispensador: %s\n", WiFi.localIP().toString().c_str());
    } else {
      Serial.println("Wi-Fi: no se conecto al hotspot; se reintenta cada 60 s. Red propia: Dispensador 192.168.4.1");
    }
  }
  lastNetworkRetry = millis();

  ArduinoOTA.setHostname("Dispensador");
  ArduinoOTA.setPassword(DeviceConfig::OTA_PASSWORD);
  ArduinoOTA.onStart([]() { otaInProgress = true; });
  ArduinoOTA.onEnd([]() { otaInProgress = false; });
  ArduinoOTA.onError([](ota_error_t) { otaInProgress = false; });
  ArduinoOTA.begin();
}

void maintainNetwork() {
  if (otaInProgress || strcmp(DeviceConfig::WIFI_SSID, "CONFIGURA_TU_WIFI") == 0) return;

  const bool stationConnected = WiFi.status() == WL_CONNECTED;
  if (stationConnected || millis() - lastNetworkRetry < NETWORK_RETRY_INTERVAL_MS) return;

  lastNetworkRetry = millis();
  WiFi.begin(DeviceConfig::WIFI_SSID, DeviceConfig::WIFI_PASSWORD);
}
}

void updateDisplay() {
  const MedicationScheduleState* next = schedules.nextDue();
  display.showHome(clockService.localNow(), clockService.valid(),
      next == nullptr ? nullptr : next->medicationName,
      next == nullptr ? 0 : next->nextDue);
}

void setup() {
  // UART0 (GPIO43/44) queda libre al retirar el DS3231: consola y carga de firmware.
  Serial.begin(DeviceConfig::SERIAL_BAUD);
  carousel.begin();
  sensors.begin();
  feeder.begin();
  // feeder.home();
  // carousel.home();
  indicators.begin();
  audio.begin();
  schedules.begin();
  clockService.begin();
  display.begin();
  connectNetwork();
  synchronizeClockIfReady();
  lastClockSyncAttempt = millis();
  api.begin();
  console.begin();
  updateDisplay();
}

void loop() {
  ArduinoOTA.handle();
  api.loop();
  console.poll();
  maintainNetwork();
  const uint32_t now = millis();
  if (WiFi.status() == WL_CONNECTED
      && now - lastClockSyncAttempt >= CLOCK_SYNC_RETRY_INTERVAL_MS
      && (!networkClockSynchronized || !schedulesRebasedToNetworkTime
          || now - lastSuccessfulClockSync >= CLOCK_SYNC_INTERVAL_MS)) {
    lastClockSyncAttempt = now;
    synchronizeClockIfReady();
  }
  indicators.poll();
  if (carousel.homed() && feeder.homed()) {
    schedules.poll(clockService.localNow().unixtime(), clockService.valid(), dispenser);
  }

  if (millis() - lastDisplayUpdate >= 1000) {
    lastDisplayUpdate = millis();
    updateDisplay();
  }
}
