#include "IndicatorService.h"
#include "DeviceConfig.h"

void IndicatorService::begin() {
  pinMode(DeviceConfig::INDICATOR_DATA_PIN, OUTPUT);
  pinMode(DeviceConfig::INDICATOR_CLOCK_PIN, OUTPUT);
  pinMode(DeviceConfig::INDICATOR_LATCH_PIN, OUTPUT);
  digitalWrite(DeviceConfig::INDICATOR_LATCH_PIN, LOW);
  writeOutputs();
}

void IndicatorService::writeOutputs() {
  digitalWrite(DeviceConfig::INDICATOR_LATCH_PIN, LOW);
  shiftOut(DeviceConfig::INDICATOR_DATA_PIN, DeviceConfig::INDICATOR_CLOCK_PIN,
      MSBFIRST, outputMask_);
  digitalWrite(DeviceConfig::INDICATOR_LATCH_PIN, HIGH);
}

bool IndicatorService::indicateCompartment(uint8_t compartment) {
  if (compartment < 1 || compartment > 7) return false;
  outputMask_ = (outputMask_ & 0x01) | (1U << compartment);
  writeOutputs();
  return true;
}

void IndicatorService::indicatePillOutput() {
  outputMask_ |= 0x01;
  pillOutputUntil_ = millis() + DeviceConfig::OUTPUT_LIGHT_DURATION_MS;
  pillOutputTimed_ = true;
  writeOutputs();
}

void IndicatorService::clearAll() {
  outputMask_ = 0;
  pillOutputTimed_ = false;
  writeOutputs();
}

void IndicatorService::poll() {
  if (!pillOutputTimed_ || static_cast<int32_t>(millis() - pillOutputUntil_) < 0) return;
  outputMask_ &= static_cast<uint8_t>(~0x01);
  pillOutputTimed_ = false;
  writeOutputs();
}
