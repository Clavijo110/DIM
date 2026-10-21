#pragma once

#include <Arduino.h>

class IndicatorService {
 public:
  void begin();
  bool indicateCompartment(uint8_t compartment);
  void indicatePillOutput();
  void clearAll();
  void poll();

 private:
  void writeOutputs();

  uint8_t outputMask_ = 0;
  uint32_t pillOutputUntil_ = 0;
  bool pillOutputTimed_ = false;
};
