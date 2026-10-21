#include "ClockService.h"
#include "DeviceConfig.h"
#include <WiFi.h>
#include <sys/time.h>
#include <time.h>

namespace {
constexpr uint32_t MIN_VALID_UNIX_TIME = 1735689600UL;  // 2025-01-01
}

bool ClockService::begin() {
  preferences_.begin("dim-clock", false);
  timezoneOffsetMinutes_ = preferences_.getShort(
      "tz", DeviceConfig::DEFAULT_TIMEZONE_OFFSET_MINUTES);
  valid_ = static_cast<uint32_t>(time(nullptr)) >= MIN_VALID_UNIX_TIME;
  return true;
}

bool ClockService::setUnixTime(uint32_t unixTime, int16_t timezoneOffsetMinutes) {
  if (unixTime < MIN_VALID_UNIX_TIME || timezoneOffsetMinutes < -840 || timezoneOffsetMinutes > 840) return false;
  const timeval now{static_cast<time_t>(unixTime), 0};
  settimeofday(&now, nullptr);
  timezoneOffsetMinutes_ = timezoneOffsetMinutes;
  preferences_.putShort("tz", timezoneOffsetMinutes_);
  valid_ = true;
  return true;
}

bool ClockService::synchronizeFromNetwork() {
  if (WiFi.status() != WL_CONNECTED) return false;
  configTime(0, 0, "pool.ntp.org", "time.google.com");
  struct tm networkClock {};
  if (!getLocalTime(&networkClock, 8000)) return false;
  if (static_cast<uint32_t>(time(nullptr)) < MIN_VALID_UNIX_TIME) return false;
  valid_ = true;
  return true;
}

DateTime ClockService::localNow() {
  return DateTime(unixTime()) + TimeSpan(0, 0, timezoneOffsetMinutes_, 0);
}

String ClockService::isoUtc() {
  const DateTime now(unixTime());
  char value[21];
  snprintf(value, sizeof(value), "%04u-%02u-%02uT%02u:%02u:%02uZ",
      now.year(), now.month(), now.day(), now.hour(), now.minute(), now.second());
  return String(value);
}

uint32_t ClockService::unixTime() { return static_cast<uint32_t>(time(nullptr)); }
int16_t ClockService::timezoneOffsetMinutes() const { return timezoneOffsetMinutes_; }
bool ClockService::valid() const { return valid_; }
