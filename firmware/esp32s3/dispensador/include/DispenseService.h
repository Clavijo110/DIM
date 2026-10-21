#pragma once

#include <Arduino.h>
#include "AudioService.h"
#include "CarouselService.h"
#include "DisplayService.h"
#include "FeederService.h"
#include "IndicatorService.h"
#include "PillSize.h"
#include "SensorService.h"

enum class DispenseError : uint8_t {
  None,
  CarouselHome,
  FeederHome,
  Motion,
  PillNotDetected,
};

class DispenseService {
 public:
  DispenseService(CarouselService& carousel, FeederService& feeder,
      SensorService& sensors, IndicatorService& indicators, AudioService& audio,
      DisplayService& display, Print& log);
  DispenseError run(uint8_t compartment, PillSize size, uint8_t pillsPerDose,
      uint8_t& pillsDetected);

 private:
  bool dispenseOne(uint8_t compartment, PillSize size, bool& pillDetected);
  bool step(bool ok, const char* description);

  CarouselService& carousel_;
  FeederService& feeder_;
  SensorService& sensors_;
  IndicatorService& indicators_;
  AudioService& audio_;
  DisplayService& display_;
  Print& log_;
};
