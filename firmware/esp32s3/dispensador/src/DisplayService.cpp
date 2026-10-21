#include "DisplayService.h"
#include "DeviceConfig.h"
#include <cstring>

namespace {
constexpr uint16_t WIDTH = 240;
constexpr uint16_t HEIGHT = 320;
constexpr uint16_t COLOR_BACKGROUND = 0xFFFF;
constexpr uint16_t COLOR_TEXT = 0x0000;
constexpr uint16_t COLOR_PANEL = 0x0010;
constexpr uint16_t COLOR_GREEN = 0x0640;
}

void DisplayService::writeByte(uint8_t value) {
  for (uint8_t bit = 0; bit < 8; ++bit) {
    digitalWrite(DeviceConfig::LCD_DATA_PINS[bit], (value >> bit) & 1);
  }
  digitalWrite(DeviceConfig::LCD_WR_PIN, LOW);
  digitalWrite(DeviceConfig::LCD_WR_PIN, HIGH);
}

void DisplayService::command(uint8_t value) {
  digitalWrite(DeviceConfig::LCD_RS_PIN, LOW);
  writeByte(value);
}

void DisplayService::data(uint8_t value) {
  digitalWrite(DeviceConfig::LCD_RS_PIN, HIGH);
  writeByte(value);
}

void DisplayService::begin() {
  const uint8_t controlPins[] = {DeviceConfig::LCD_RS_PIN, DeviceConfig::LCD_CS_PIN,
      DeviceConfig::LCD_WR_PIN, DeviceConfig::LCD_RST_PIN, DeviceConfig::LCD_RD_PIN};
  for (uint8_t pin : controlPins) {
    pinMode(pin, OUTPUT);
    digitalWrite(pin, HIGH);
  }
  for (uint8_t pin : DeviceConfig::LCD_DATA_PINS) {
    pinMode(pin, OUTPUT);
    digitalWrite(pin, LOW);
  }

  digitalWrite(DeviceConfig::LCD_RST_PIN, LOW);
  delay(20);
  digitalWrite(DeviceConfig::LCD_RST_PIN, HIGH);
  delay(150);
  digitalWrite(DeviceConfig::LCD_CS_PIN, LOW);
  command(0x01);
  delay(150);
  const uint8_t initCommands[][6] = {
      {0xEF, 0x03, 0x80, 0x02, 0x00, 0x00}, {0xCF, 0x00, 0xC1, 0x30, 0x00, 0x00},
      {0xED, 0x64, 0x03, 0x12, 0x81, 0x00}, {0xE8, 0x85, 0x00, 0x78, 0x00, 0x00},
      {0xCB, 0x39, 0x2C, 0x00, 0x34, 0x02}, {0xF7, 0x20, 0x00, 0x00, 0x00, 0x00},
      {0xEA, 0x00, 0x00, 0x00, 0x00, 0x00}};
  const uint8_t initLengths[] = {3, 3, 4, 3, 4, 1, 2};
  for (uint8_t index = 0; index < sizeof(initLengths); ++index) {
    command(initCommands[index][0]);
    for (uint8_t byte = 0; byte < initLengths[index]; ++byte) data(initCommands[index][byte + 1]);
  }
  command(0xC0); data(0x23);
  command(0xC1); data(0x10);
  command(0xC5); data(0x3E); data(0x28);
  command(0xC7); data(0x86);
  command(0x36); data(0x48);  // Vertical, orden BGR (0x88 = vertical invertida)
  command(0x3A); data(0x55);  // RGB565
  command(0xB1); data(0x00); data(0x18);
  command(0xB6); data(0x08); data(0x82); data(0x27);
  command(0xF2); data(0x00);
  command(0x26); data(0x01);
  const uint8_t gammaPositive[] = {0x0F, 0x31, 0x2B, 0x0C, 0x0E, 0x08, 0x4E, 0xF1,
      0x37, 0x07, 0x10, 0x03, 0x0E, 0x09, 0x00};
  command(0xE0);
  for (uint8_t value : gammaPositive) data(value);
  const uint8_t gammaNegative[] = {0x00, 0x0E, 0x14, 0x03, 0x11, 0x07, 0x31, 0xC1,
      0x48, 0x08, 0x0F, 0x0C, 0x31, 0x36, 0x0F};
  command(0xE1);
  for (uint8_t value : gammaNegative) data(value);
  command(0x11);
  delay(150);
  command(0x29);
  delay(100);
  digitalWrite(DeviceConfig::LCD_CS_PIN, HIGH);

  showMessage("DIM", "INICIANDO", "", 0);
}

void DisplayService::setWindow(uint16_t x1, uint16_t y1, uint16_t x2, uint16_t y2) {
  command(0x2A);
  data(x1 >> 8); data(x1 & 0xFF); data(x2 >> 8); data(x2 & 0xFF);
  command(0x2B);
  data(y1 >> 8); data(y1 & 0xFF); data(y2 >> 8); data(y2 & 0xFF);
  command(0x2C);
  digitalWrite(DeviceConfig::LCD_RS_PIN, HIGH);
}

void DisplayService::fillRect(uint16_t x, uint16_t y, uint16_t width, uint16_t height, uint16_t color) {
  if (width == 0 || height == 0) return;
  digitalWrite(DeviceConfig::LCD_CS_PIN, LOW);
  setWindow(x, y, x + width - 1, y + height - 1);
  const uint8_t high = color >> 8;
  const uint8_t low = color & 0xFF;
  const uint32_t pixels = static_cast<uint32_t>(width) * height;
  for (uint32_t pixel = 0; pixel < pixels; ++pixel) {
    writeByte(high);
    writeByte(low);
  }
  digitalWrite(DeviceConfig::LCD_CS_PIN, HIGH);
}

const uint8_t* DisplayService::glyph(char value) const {
  static const uint8_t digits[10][5] = {
      {0x3E, 0x51, 0x49, 0x45, 0x3E}, {0x00, 0x42, 0x7F, 0x40, 0x00},
      {0x42, 0x61, 0x51, 0x49, 0x46}, {0x21, 0x41, 0x45, 0x4B, 0x31},
      {0x18, 0x14, 0x12, 0x7F, 0x10}, {0x27, 0x45, 0x45, 0x45, 0x39},
      {0x3C, 0x4A, 0x49, 0x49, 0x30}, {0x01, 0x71, 0x09, 0x05, 0x03},
      {0x36, 0x49, 0x49, 0x49, 0x36}, {0x06, 0x49, 0x49, 0x29, 0x1E}};
  static const uint8_t colon[5] = {0x00, 0x36, 0x36, 0x00, 0x00};
  static const uint8_t dash[5] = {0x08, 0x08, 0x08, 0x08, 0x08};
  static const uint8_t hash[5] = {0x14, 0x7F, 0x14, 0x7F, 0x14};
  static const uint8_t blank[5] = {0, 0, 0, 0, 0};
  static const uint8_t letters[26][5] = {
      {0x7E, 0x11, 0x11, 0x11, 0x7E}, {0x7F, 0x49, 0x49, 0x49, 0x36},
      {0x3E, 0x41, 0x41, 0x41, 0x22}, {0x7F, 0x41, 0x41, 0x22, 0x1C},
      {0x7F, 0x49, 0x49, 0x49, 0x41}, {0x7F, 0x09, 0x09, 0x09, 0x01},
      {0x3E, 0x41, 0x49, 0x49, 0x7A}, {0x7F, 0x08, 0x08, 0x08, 0x7F},
      {0x00, 0x41, 0x7F, 0x41, 0x00}, {0x20, 0x40, 0x41, 0x3F, 0x01},
      {0x7F, 0x08, 0x14, 0x22, 0x41}, {0x7F, 0x40, 0x40, 0x40, 0x40},
      {0x7F, 0x02, 0x0C, 0x02, 0x7F}, {0x7F, 0x04, 0x08, 0x10, 0x7F},
      {0x3E, 0x41, 0x41, 0x41, 0x3E}, {0x7F, 0x09, 0x09, 0x09, 0x06},
      {0x3E, 0x41, 0x51, 0x21, 0x5E}, {0x7F, 0x09, 0x19, 0x29, 0x46},
      {0x46, 0x49, 0x49, 0x49, 0x31}, {0x01, 0x01, 0x7F, 0x01, 0x01},
      {0x3F, 0x40, 0x40, 0x40, 0x3F}, {0x1F, 0x20, 0x40, 0x20, 0x1F},
      {0x7F, 0x20, 0x18, 0x20, 0x7F}, {0x63, 0x14, 0x08, 0x14, 0x63},
      {0x07, 0x08, 0x70, 0x08, 0x07}, {0x61, 0x51, 0x49, 0x45, 0x43}};
  if (value >= 'A' && value <= 'Z') return letters[value - 'A'];
  if (value >= '0' && value <= '9') return digits[value - '0'];
  if (value == ':') return colon;
  if (value == '-') return dash;
  if (value == '#') return hash;
  return blank;
}

void DisplayService::drawText(const char* text, uint16_t x, uint16_t y, uint8_t scale,
                              uint16_t color, uint16_t background) {
  while (*text) {
    const uint8_t* columns = glyph(*text++);
    const uint16_t width = 6 * scale;
    const uint16_t height = 8 * scale;
    digitalWrite(DeviceConfig::LCD_CS_PIN, LOW);
    setWindow(x, y, x + width - 1, y + height - 1);
    for (uint8_t row = 0; row < 8; ++row) {
      for (uint16_t sy = 0; sy < scale; ++sy) {
        for (uint8_t column = 0; column < 6; ++column) {
          const uint16_t pixel = column < 5 && (columns[column] & (1 << row)) ? color : background;
          for (uint16_t sx = 0; sx < scale; ++sx) {
            writeByte(pixel >> 8);
            writeByte(pixel & 0xFF);
          }
        }
      }
    }
    digitalWrite(DeviceConfig::LCD_CS_PIN, HIGH);
    x += width;
  }
}

// Centra el texto y reduce la escala si no cabe en el ancho de la pantalla.
void DisplayService::drawCentered(const char* text, uint16_t y, uint8_t scale,
                                  uint16_t color, uint16_t background) {
  const size_t length = strlen(text);
  if (length == 0) return;
  while (scale > 1 && length * 6 * scale > WIDTH) --scale;
  const uint16_t width = length * 6 * scale;
  drawText(text, width < WIDTH ? (WIDTH - width) / 2 : 0, y, scale, color, background);
}

// Mayúsculas sin tildes: la fuente solo tiene A-Z, 0-9, ':', '-' y '#'.
void DisplayService::toDisplayText(const char* input, char* output, size_t outputSize) {
  size_t out = 0;
  for (size_t i = 0; input != nullptr && input[i] != '\0' && out < outputSize - 1; ++i) {
    const uint8_t ch = static_cast<uint8_t>(input[i]);
    if (ch == 0xC3 && input[i + 1] != '\0') {
      const uint8_t accent = static_cast<uint8_t>(input[++i]);
      output[out++] = accent == 0x91 || accent == 0xB1 ? 'N'
          : accent == 0x81 || accent == 0xA1 ? 'A'
          : accent == 0x89 || accent == 0xA9 ? 'E'
          : accent == 0x8D || accent == 0xAD ? 'I'
          : accent == 0x93 || accent == 0xB3 ? 'O'
          : accent == 0x9A || accent == 0xBA || accent == 0x9C || accent == 0xBC ? 'U'
          : ' ';
    } else if (ch >= 'a' && ch <= 'z') {
      output[out++] = static_cast<char>(ch - 'a' + 'A');
    } else if ((ch >= 'A' && ch <= 'Z') || (ch >= '0' && ch <= '9') || ch == ' ' || ch == '-'
        || ch == ':' || ch == '#') {
      output[out++] = static_cast<char>(ch);
    }
  }
  output[out] = '\0';
}

void DisplayService::showHome(const DateTime& now, bool clockValid,
    const char* medicationName, uint32_t nextDoseTime) {
  if (messageActive_) {
    if (static_cast<int32_t>(millis() - messageUntil_) < 0) return;
    messageActive_ = false;
    shownKey_[0] = '\0';
  }

  const bool hasDose = medicationName != nullptr && medicationName[0] != '\0' && nextDoseTime != 0;
  char nameText[21]{};
  char nextTime[6] = "";
  char footer[20];
  if (hasDose) {
    toDisplayText(medicationName, nameText, sizeof(nameText));
    const DateTime next(nextDoseTime);
    snprintf(nextTime, sizeof(nextTime), "%02u:%02u", next.hour(), next.minute());
  }
  if (clockValid) {
    snprintf(footer, sizeof(footer), "AHORA %02u:%02u", now.hour(), now.minute());
  } else {
    snprintf(footer, sizeof(footer), "SINCRONIZAR HORA");
  }

  char key[sizeof(shownKey_)];
  snprintf(key, sizeof(key), "%s|%s|%s", nameText, nextTime, footer);
  if (strcmp(key, shownKey_) == 0) return;
  strcpy(shownKey_, key);

  fillRect(0, 0, WIDTH, HEIGHT, COLOR_BACKGROUND);
  fillRect(0, 0, WIDTH, 56, COLOR_PANEL);
  fillRect(0, 54, WIDTH, 2, COLOR_GREEN);
  drawCentered("PROXIMA DOSIS", 20, 2, COLOR_BACKGROUND, COLOR_PANEL);

  if (hasDose) {
    fillRect(12, 76, 6, 64, COLOR_GREEN);
    drawCentered(nameText, 96, 3, COLOR_TEXT, COLOR_BACKGROUND);
    fillRect(12, 160, WIDTH - 24, 2, COLOR_GREEN);
    drawCentered("HORA DE TOMA", 182, 2, COLOR_PANEL, COLOR_BACKGROUND);
    drawCentered(nextTime, 216, 7, COLOR_TEXT, COLOR_BACKGROUND);
  } else {
    drawCentered("SIN AGENDA", 110, 3, COLOR_TEXT, COLOR_BACKGROUND);
    drawCentered("PROGRAME DESDE", 182, 2, COLOR_PANEL, COLOR_BACKGROUND);
    drawCentered("LA APP", 206, 2, COLOR_PANEL, COLOR_BACKGROUND);
  }

  fillRect(0, 288, WIDTH, 32, COLOR_PANEL);
  drawCentered(footer, 296, 2, COLOR_BACKGROUND, COLOR_PANEL);
}

void DisplayService::showMessage(const char* title, const char* line1, const char* line2,
    uint32_t holdMs) {
  char text[21];
  fillRect(0, 0, WIDTH, HEIGHT, COLOR_BACKGROUND);
  fillRect(0, 0, WIDTH, 56, COLOR_PANEL);
  fillRect(0, 54, WIDTH, 2, COLOR_GREEN);
  toDisplayText(title, text, sizeof(text));
  drawCentered(text, 20, 2, COLOR_BACKGROUND, COLOR_PANEL);
  toDisplayText(line1, text, sizeof(text));
  drawCentered(text, 130, 3, COLOR_TEXT, COLOR_BACKGROUND);
  toDisplayText(line2, text, sizeof(text));
  drawCentered(text, 190, 3, COLOR_TEXT, COLOR_BACKGROUND);
  messageActive_ = true;
  messageUntil_ = millis() + holdMs;
  shownKey_[0] = '\0';
}
