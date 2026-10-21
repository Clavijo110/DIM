#pragma once

#include <Arduino.h>

class CarouselService {
 public:
  void begin();
  bool home();
  bool returnHome();
  void setHold(bool hold);
  bool moveToPosition(uint8_t position);
  bool moveAlignmentOffset(bool outward);
  bool vibrateInPlace();
  bool runCompartmentCycle(uint8_t compartment);
  bool testAllCompartments();
  uint8_t position() const;
  bool homed() const;

 private:
  void step(uint8_t direction, uint16_t delayUs);
  void moveWithRamp(uint8_t direction, uint32_t steps);
  bool vibrate(uint16_t durationMs, uint8_t amplitudeSteps);
  bool home(uint8_t initialSearchDirection);
  bool seekSensor(uint8_t level, uint8_t direction, uint16_t maxSteps);
  bool stableSensor(uint8_t level) const;
  void setEnabled(bool enabled);

  uint8_t position_ = 0;
  bool homed_ = false;
  bool hold_ = false;
  bool enabled_ = false;
};