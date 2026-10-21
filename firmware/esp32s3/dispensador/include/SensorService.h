#pragma once

#include <Arduino.h>

class SensorService {
 public:
  void begin();
  bool carouselHome() const;
  bool feederHome() const;
  bool pillDetected() const;
  uint32_t pillEventCount() const;

 private:
  static void IRAM_ATTR onPillFalling();
  static volatile uint32_t pillEvents_;
};