#pragma once

#include <Arduino.h>

class AudioService {
 public:
  void begin();
  bool playTrack(uint16_t track, uint8_t volume);

 private:
  void sendCommand(uint8_t command, uint16_t parameter);
  HardwareSerial player_{1};
  bool ready_ = false;
};
