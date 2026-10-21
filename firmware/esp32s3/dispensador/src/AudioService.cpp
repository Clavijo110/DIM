#include "AudioService.h"
#include "DeviceConfig.h"

void AudioService::begin() {
  player_.begin(9600, SERIAL_8N1, DeviceConfig::DFPLAYER_RX_PIN, DeviceConfig::DFPLAYER_TX_PIN);
  sendCommand(0x07, 0);
  ready_ = true;
}

void AudioService::sendCommand(uint8_t command, uint16_t parameter) {
  const uint8_t parameterHigh = static_cast<uint8_t>(parameter >> 8);
  const uint8_t parameterLow = static_cast<uint8_t>(parameter & 0xff);
  const uint16_t checksum = static_cast<uint16_t>(
      0U - (0xffU + 0x06U + command + parameterHigh + parameterLow));
  const uint8_t packet[] = {
      0x7e, 0xff, 0x06, command, 0x00, parameterHigh, parameterLow,
      static_cast<uint8_t>(checksum >> 8), static_cast<uint8_t>(checksum & 0xff), 0xef};
  player_.write(packet, sizeof(packet));
}

bool AudioService::playTrack(uint16_t track, uint8_t volume) {
  if (!ready_ || track < 1 || track > 255 || volume > 30) return false;
  sendCommand(0x06, volume);
  sendCommand(0x16, 0);
  delay(300);
  sendCommand(0x0f, static_cast<uint16_t>(0x0100U | track));
  return true;
}
