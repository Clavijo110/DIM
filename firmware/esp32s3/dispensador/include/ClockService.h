#pragma once

#include <Arduino.h>
#include <Preferences.h>
#include <RTClib.h>  // Solo por la clase DateTime; ya no hay DS3231 conectado.

// Reloj por software (reloj interno del ESP32). Se ajusta por NTP cuando hay
// internet o desde la app con POST /clock. Se pierde al apagar el equipo.
class ClockService {
 public:
  bool begin();
  bool setUnixTime(uint32_t unixTime, int16_t timezoneOffsetMinutes);
  bool synchronizeFromNetwork();
  DateTime localNow();
  String isoUtc();
  uint32_t unixTime();
  int16_t timezoneOffsetMinutes() const;
  bool valid() const;

 private:
  Preferences preferences_;
  bool valid_ = false;
  int16_t timezoneOffsetMinutes_ = 0;
};
