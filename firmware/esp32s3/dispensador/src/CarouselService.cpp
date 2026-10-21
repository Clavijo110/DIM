#include "CarouselService.h"
#include "DeviceConfig.h"

namespace {
constexpr uint16_t MAX_HOME_STEPS = 2 * DeviceConfig::CAROUSEL_STEPS_PER_REVOLUTION;
}

void CarouselService::begin() {
  digitalWrite(DeviceConfig::CAROUSEL_ENABLE_PIN, HIGH);
  pinMode(DeviceConfig::CAROUSEL_ENABLE_PIN, OUTPUT);
  digitalWrite(DeviceConfig::CAROUSEL_ENABLE_PIN, HIGH);
  pinMode(DeviceConfig::CAROUSEL_STEP_PIN, OUTPUT);
  pinMode(DeviceConfig::CAROUSEL_DIR_PIN, OUTPUT);
  digitalWrite(DeviceConfig::CAROUSEL_STEP_PIN, LOW);
}

void CarouselService::setEnabled(bool enabled) {
  // Durante un ciclo de dispensación el NEMA no se suelta entre movimientos.
  if (!enabled && hold_) return;
  if (enabled == enabled_) return;
  digitalWrite(DeviceConfig::CAROUSEL_ENABLE_PIN, enabled ? LOW : HIGH);
  enabled_ = enabled;
  if (enabled) delay(5);
}

void CarouselService::setHold(bool hold) {
  hold_ = hold;
  if (!hold) setEnabled(false);
}

void CarouselService::step(uint8_t direction, uint16_t delayUs) {
  digitalWrite(DeviceConfig::CAROUSEL_DIR_PIN, direction);
  delayMicroseconds(10);
  digitalWrite(DeviceConfig::CAROUSEL_STEP_PIN, HIGH);
  delayMicroseconds(DeviceConfig::CAROUSEL_PULSE_HIGH_US);
  digitalWrite(DeviceConfig::CAROUSEL_STEP_PIN, LOW);
  delayMicroseconds(delayUs);
}

bool CarouselService::stableSensor(uint8_t level) const {
  if (digitalRead(DeviceConfig::CAROUSEL_HOME_PIN) != level) return false;
  delay(DeviceConfig::CAROUSEL_HOME_CONFIRMATION_MS);
  return digitalRead(DeviceConfig::CAROUSEL_HOME_PIN) == level;
}

bool CarouselService::seekSensor(uint8_t level, uint8_t direction, uint16_t maxSteps) {
  for (uint16_t stepIndex = 0; stepIndex < maxSteps; ++stepIndex) {
    if (stableSensor(level)) return true;
    step(direction, DeviceConfig::CAROUSEL_SEARCH_DELAY_US);
  }
  return stableSensor(level);
}

bool CarouselService::home() {
  return home(DeviceConfig::CAROUSEL_DIR_ANTICLOCKWISE);
}

bool CarouselService::home(uint8_t initialSearchDirection) {
  setEnabled(true);
  const uint8_t blocked = DeviceConfig::CAROUSEL_HOME_BLOCKED_LEVEL;
  const uint8_t free = blocked == HIGH ? LOW : HIGH;

  if (digitalRead(DeviceConfig::CAROUSEL_HOME_PIN) != blocked
      && !seekSensor(blocked, initialSearchDirection, MAX_HOME_STEPS)) {
    homed_ = false;
    setEnabled(false);
    return false;
  }
  if (!seekSensor(free, DeviceConfig::CAROUSEL_DIR_CLOCKWISE, MAX_HOME_STEPS)) {
    homed_ = false;
    setEnabled(false);
    return false;
  }
  for (uint8_t stepIndex = 0; stepIndex < DeviceConfig::CAROUSEL_HOME_BACKOFF_STEPS; ++stepIndex) {
    step(DeviceConfig::CAROUSEL_DIR_CLOCKWISE, DeviceConfig::CAROUSEL_SEARCH_DELAY_US);
  }
  if (!seekSensor(blocked, DeviceConfig::CAROUSEL_DIR_ANTICLOCKWISE, MAX_HOME_STEPS)) {
    homed_ = false;
    setEnabled(false);
    return false;
  }

  digitalWrite(DeviceConfig::CAROUSEL_STEP_PIN, LOW);
  position_ = 0;
  homed_ = true;
  setEnabled(false);
  return true;
}

bool CarouselService::returnHome() {
  if (!homed_) return home();
  if (position_ == 0) return true;
  // Regresa por donde vino: 1-4 salieron en antihorario, 5-7 en horario.
  const uint8_t count = DeviceConfig::CAROUSEL_POSITION_COUNT;
  const bool clockwise = position_ <= count / 2;
  const uint8_t positions = clockwise ? position_ : count - position_;
  const uint8_t direction = clockwise
      ? DeviceConfig::CAROUSEL_DIR_CLOCKWISE
      : DeviceConfig::CAROUSEL_DIR_ANTICLOCKWISE;
  setEnabled(true);
  moveWithRamp(direction, static_cast<uint32_t>(positions) * DeviceConfig::CAROUSEL_STEPS_PER_POSITION
      * DeviceConfig::CAROUSEL_RETURN_FAST_PERCENT / 100);
  setEnabled(false);
  return home(direction);
}

void CarouselService::moveWithRamp(uint8_t direction, uint32_t steps) {
  if (steps == 0) return;

  digitalWrite(DeviceConfig::CAROUSEL_DIR_PIN, direction);
  delayMicroseconds(20);
  const uint32_t ramp = min(static_cast<uint32_t>(DeviceConfig::CAROUSEL_RAMP_STEPS), steps / 2);

  for (uint32_t index = 0; index < steps; ++index) {
    uint16_t delayUs = DeviceConfig::CAROUSEL_CRUISE_DELAY_US;
    if (ramp > 0 && index < ramp) {
      delayUs = DeviceConfig::CAROUSEL_START_DELAY_US
          - ((DeviceConfig::CAROUSEL_START_DELAY_US - DeviceConfig::CAROUSEL_CRUISE_DELAY_US) * index / ramp);
    }

    const uint32_t remaining = steps - 1 - index;
    if (ramp > 0 && remaining < ramp) {
      const uint16_t finalDelay = DeviceConfig::CAROUSEL_START_DELAY_US
          - ((DeviceConfig::CAROUSEL_START_DELAY_US - DeviceConfig::CAROUSEL_CRUISE_DELAY_US) * remaining / ramp);
      if (finalDelay > delayUs) delayUs = finalDelay;
    }

    digitalWrite(DeviceConfig::CAROUSEL_STEP_PIN, HIGH);
    delayMicroseconds(DeviceConfig::CAROUSEL_PULSE_HIGH_US);
    digitalWrite(DeviceConfig::CAROUSEL_STEP_PIN, LOW);
    delayMicroseconds(delayUs);
  }
  digitalWrite(DeviceConfig::CAROUSEL_STEP_PIN, LOW);
}

bool CarouselService::moveToPosition(uint8_t target) {
  if (!homed_ || target >= DeviceConfig::CAROUSEL_POSITION_COUNT) return false;
  const uint8_t anticlockwisePositions =
      (target + DeviceConfig::CAROUSEL_POSITION_COUNT - position_) % DeviceConfig::CAROUSEL_POSITION_COUNT;
  const uint8_t clockwisePositions =
      (position_ + DeviceConfig::CAROUSEL_POSITION_COUNT - target) % DeviceConfig::CAROUSEL_POSITION_COUNT;
  const bool moveAnticlockwise = anticlockwisePositions <= clockwisePositions;
  const uint8_t positions = moveAnticlockwise ? anticlockwisePositions : clockwisePositions;
  const uint8_t direction = moveAnticlockwise
      ? DeviceConfig::CAROUSEL_DIR_ANTICLOCKWISE
      : DeviceConfig::CAROUSEL_DIR_CLOCKWISE;
  setEnabled(true);
  moveWithRamp(direction, static_cast<uint32_t>(positions) * DeviceConfig::CAROUSEL_STEPS_PER_POSITION);
  position_ = target;
  setEnabled(false);
  return true;
}

bool CarouselService::moveAlignmentOffset(bool outward) {
  if (!homed_) return false;
  const uint8_t direction = outward
      ? DeviceConfig::CAROUSEL_DIR_ANTICLOCKWISE
      : DeviceConfig::CAROUSEL_DIR_CLOCKWISE;
  setEnabled(true);
  moveWithRamp(direction, DeviceConfig::CAROUSEL_ALIGNMENT_OFFSET_STEPS);
  setEnabled(false);
  return true;
}

bool CarouselService::vibrateInPlace() {
  return vibrate(DeviceConfig::CAROUSEL_VIBRATION_DURATION_MS,
      DeviceConfig::CAROUSEL_VIBRATION_AMPLITUDE_STEPS);
}

bool CarouselService::vibrate(uint16_t durationMs, uint8_t amplitudeSteps) {
  if (!homed_) return false;

  setEnabled(true);
  const uint32_t startedAt = millis();
  while (millis() - startedAt < durationMs) {
    for (uint8_t stepIndex = 0; stepIndex < amplitudeSteps; ++stepIndex) {
      step(DeviceConfig::CAROUSEL_DIR_CLOCKWISE, DeviceConfig::CAROUSEL_VIBRATION_DELAY_US);
    }
    for (uint8_t stepIndex = 0; stepIndex < amplitudeSteps; ++stepIndex) {
      step(DeviceConfig::CAROUSEL_DIR_ANTICLOCKWISE, DeviceConfig::CAROUSEL_VIBRATION_DELAY_US);
    }
  }
  digitalWrite(DeviceConfig::CAROUSEL_STEP_PIN, LOW);
  setEnabled(false);
  return true;
}

bool CarouselService::runCompartmentCycle(uint8_t compartment) {
  if (compartment < 1 || compartment >= DeviceConfig::CAROUSEL_POSITION_COUNT) return false;
  if (!homed_ && !home()) return false;
  setHold(true);
  const bool moved = moveToPosition(compartment)
      && moveAlignmentOffset(true) && moveAlignmentOffset(false)
      && vibrateInPlace() && returnHome();
  setHold(false);
  return moved;
}

bool CarouselService::testAllCompartments() {
  for (uint8_t compartment = 1; compartment <= DeviceConfig::MEDICATION_COMPARTMENT_COUNT; ++compartment) {
    if (!runCompartmentCycle(compartment)) return false;
    delay(1000);
  }
  return true;
}

uint8_t CarouselService::position() const { return position_; }
bool CarouselService::homed() const { return homed_; }