#pragma once

#include <Arduino.h>
#include <RTClib.h>

// LCD ILI9341 2,4" en bus de 8 bits, orientación vertical (240 x 320).
class DisplayService {
 public:
  void begin();
  // Pantalla principal (próxima dosis). Solo se redibuja cuando cambia algo.
  void showHome(const DateTime& now, bool clockValid, const char* medicationName,
      uint32_t nextDoseTime);
  // Mensaje a pantalla completa; se mantiene holdMs antes de volver a la principal.
  void showMessage(const char* title, const char* line1, const char* line2, uint32_t holdMs);

 private:
  void writeByte(uint8_t value);
  void command(uint8_t value);
  void data(uint8_t value);
  void setWindow(uint16_t x1, uint16_t y1, uint16_t x2, uint16_t y2);
  void fillRect(uint16_t x, uint16_t y, uint16_t width, uint16_t height, uint16_t color);
  void drawText(const char* text, uint16_t x, uint16_t y, uint8_t scale, uint16_t color, uint16_t background);
  void drawCentered(const char* text, uint16_t y, uint8_t scale, uint16_t color, uint16_t background);
  const uint8_t* glyph(char value) const;
  static void toDisplayText(const char* input, char* output, size_t outputSize);

  char shownKey_[64] = "";
  uint32_t messageUntil_ = 0;
  bool messageActive_ = false;
};
