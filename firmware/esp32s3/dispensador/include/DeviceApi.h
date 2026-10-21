#pragma once

#include <Arduino.h>
#include <WebServer.h>
#include "AudioService.h"
#include "CarouselService.h"
#include "ClockService.h"
#include "DispenseService.h"
#include "FeederService.h"
#include "IndicatorService.h"
#include "ScheduleService.h"
#include "SensorService.h"

class DeviceApi {
 public:
  DeviceApi(CarouselService& carousel, FeederService& feeder,
      SensorService& sensors, ClockService& clock, ScheduleService& schedules,
      DispenseService& dispenser, IndicatorService& indicators, AudioService& audio);
  void begin();
  void loop();

 private:
  bool authorized();
  void addCorsHeaders();
  void sendError(uint16_t status, const char* message);
  void handleStatus();
  void handleCarouselHome();
  void handleCarouselPosition();
  void handleCarouselVibrate();
  void handleCarouselCompartment();
  void handleCarouselTest();
  void handleFeederHome();
  void handleFeederPosition();
  void handleDispense();
  void handleClockSync();
  void handleSchedules();
  void handleScheduleOnce();
  void handleCancelScheduleOnce();
  void handleIndicateCompartment();
  void handleTestOutputIndicator();
  void handleAudioTest();

  WebServer server_{80};
  CarouselService& carousel_;
  FeederService& feeder_;
  SensorService& sensors_;
  ClockService& clock_;
  ScheduleService& schedules_;
  DispenseService& dispenser_;
  IndicatorService& indicators_;
  AudioService& audio_;
};