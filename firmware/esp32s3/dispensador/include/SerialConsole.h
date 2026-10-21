#pragma once

#include <Arduino.h>
#include "AudioService.h"
#include "CarouselService.h"
#include "ClockService.h"
#include "DispenseService.h"
#include "FeederService.h"
#include "IndicatorService.h"
#include "PillSize.h"
#include "SensorService.h"

// Comandos de texto por UART0 (115200 baudios, fin de línea \n). Escribe AYUDA.
class SerialConsole {
 public:
  SerialConsole(Stream& io, CarouselService& carousel, FeederService& feeder,
      SensorService& sensors, IndicatorService& indicators, AudioService& audio,
      DispenseService& dispenser, ClockService& clock);
  void begin();
  void poll();

 private:
  void execute(char* line);
  void printHelp();
  void printStatus();
  void printSensors();
  bool homeAll();
  static bool parseSize(const char* text, PillSize& size);
  static bool parseCompartment(const char* text, uint8_t& compartment);

  Stream& io_;
  CarouselService& carousel_;
  FeederService& feeder_;
  SensorService& sensors_;
  IndicatorService& indicators_;
  AudioService& audio_;
  DispenseService& dispenser_;
  ClockService& clock_;
  char buffer_[64]{};
  uint8_t length_ = 0;
};
