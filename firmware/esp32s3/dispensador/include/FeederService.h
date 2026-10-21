#pragma once

#include <Arduino.h>
#include "PillSize.h"

class FeederService {
 public:
  void begin();
  bool home();
  bool moveToSize(PillSize size);
  bool rotateHalfTurn();
  bool moveToClosed();
  bool runPositionCycle(PillSize size);
  long positionSteps() const;
  bool homed() const;

 private:
   void stepForward();
   void stepBackward();
  bool moveToStepPosition(long targetSteps);
  bool stableHome() const;
  void writePhase();
  void releaseMotor();

  uint8_t phase_ = 0;
  long positionSteps_ = 0;
  bool homed_ = false;
};