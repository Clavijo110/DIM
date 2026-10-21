#include "SensorService.h"
#include "DeviceConfig.h"

volatile uint32_t SensorService::pillEvents_ = 0;

void IRAM_ATTR SensorService::onPillFalling() {
  ++pillEvents_;
}

void SensorService::begin() {
  pinMode(DeviceConfig::CAROUSEL_HOME_PIN, INPUT);
  pinMode(DeviceConfig::FEEDER_HOME_PIN, INPUT);
  pinMode(DeviceConfig::PILL_SENSOR_PIN, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(DeviceConfig::PILL_SENSOR_PIN), onPillFalling, FALLING);
}

bool SensorService::carouselHome() const {
  return digitalRead(DeviceConfig::CAROUSEL_HOME_PIN) == DeviceConfig::CAROUSEL_HOME_BLOCKED_LEVEL;
}

bool SensorService::feederHome() const {
  return digitalRead(DeviceConfig::FEEDER_HOME_PIN) == DeviceConfig::FEEDER_HOME_LEVEL;
}

bool SensorService::pillDetected() const {
  return digitalRead(DeviceConfig::PILL_SENSOR_PIN) == DeviceConfig::PILL_DETECTED_LEVEL;
}

uint32_t SensorService::pillEventCount() const {
  noInterrupts();
  const uint32_t events = pillEvents_;
  interrupts();
  return events;
}