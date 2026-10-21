#include "DispenseService.h"
#include "DeviceConfig.h"

namespace {
// Mantiene el NEMA energizado mientras dure el objeto.
class CarouselHold {
 public:
  explicit CarouselHold(CarouselService& carousel) : carousel_(carousel) { carousel_.setHold(true); }
  ~CarouselHold() { carousel_.setHold(false); }

 private:
  CarouselService& carousel_;
};

const char* sizeName(PillSize size) {
  switch (size) {
    case PillSize::Small: return "pequena";
    case PillSize::Medium: return "mediana";
    case PillSize::Large: return "grande/capsula";
    default: return "?";
  }
}
}

DispenseService::DispenseService(CarouselService& carousel, FeederService& feeder,
    SensorService& sensors, IndicatorService& indicators, AudioService& audio,
    DisplayService& display, Print& log)
    : carousel_(carousel), feeder_(feeder), sensors_(sensors), indicators_(indicators),
      audio_(audio), display_(display), log_(log) {}

// Registra cada paso de la secuencia por la consola serial (UART0).
bool DispenseService::step(bool ok, const char* description) {
  log_.printf("  [%s] %s\n", ok ? "OK" : "FALLO", description);
  return ok;
}

bool DispenseService::dispenseOne(uint8_t compartment, PillSize size, bool& pillDetected) {
  pillDetected = false;
  if (!carousel_.homed() && !step(carousel_.home(), "Carrusel a HOME (sensor de referencia)")) return false;
  if (carousel_.position() != 0 && !step(carousel_.moveToPosition(0), "Carrusel al hueco")) return false;
  if (!step(feeder_.home(), "Disco: HOME por sensor y luego CERRADO (90 grados horario)")) return false;
  if (!step(carousel_.moveToPosition(compartment), "1. Contenedor al punto de dispensacion")) return false;
  if (!step(carousel_.moveAlignmentOffset(true), "2. Carrusel se corre 22,5 grados")) return false;
  if (!step(feeder_.moveToSize(size), "3. Disco a la cavidad del tamano")) return false;
  if (!step(carousel_.moveAlignmentOffset(false), "4. Carrusel regresa los 22,5 grados")) return false;
  if (!step(carousel_.vibrateInPlace(), "5. Vibracion 2 s")) return false;
  delay(DeviceConfig::CAROUSEL_COMPARTMENT_PAUSE_MS);
  if (!step(carousel_.returnHome(), "6. Carrusel al hueco por el camino corto")) return false;

  const uint32_t previousPillEvents = sensors_.pillEventCount();
  if (!step(feeder_.rotateHalfTurn(), "7. Disco gira 180 grados (cae la pastilla)")) return false;
  const uint32_t waitStartedAt = millis();
  while (sensors_.pillEventCount() == previousPillEvents
      && millis() - waitStartedAt < DeviceConfig::PILL_DROP_WINDOW_MS) {
    delay(5);
  }
  pillDetected = sensors_.pillEventCount() != previousPillEvents;
  step(pillDetected, pillDetected ? "8. Sensor de caida: pastilla detectada"
                                  : "8. Sensor de caida: NO detecto la pastilla");
  if (pillDetected) indicators_.indicatePillOutput();
  return step(feeder_.moveToClosed(), "9. Disco a CERRADO");
}

DispenseError DispenseService::run(uint8_t compartment, PillSize size,
    uint8_t pillsPerDose, uint8_t& pillsDetected) {
  pillsDetected = 0;
  if (compartment < 1 || compartment > 7 || pillsPerDose < 1 || pillsPerDose > 60) {
    return DispenseError::Motion;
  }
  log_.printf("\n== DISPENSAR contenedor %u, tamano %s, %u pastilla(s) ==\n",
      compartment, sizeName(size), pillsPerDose);
  char line[21];
  snprintf(line, sizeof(line), "CONTENEDOR %u", compartment);
  display_.showMessage("DISPENSANDO", line, "ESPERE", 600000);

  CarouselHold hold(carousel_);
  DispenseError result = DispenseError::None;
  if (!carousel_.homed() && !step(carousel_.home(), "Carrusel a HOME")) {
    result = DispenseError::CarouselHome;
  } else if (carousel_.position() != 0 && !step(carousel_.moveToPosition(0), "Carrusel al hueco")) {
    result = DispenseError::Motion;
  } else if (!step(feeder_.home(), "Disco a HOME y CERRADO")) {
    result = DispenseError::FeederHome;
  }

  for (uint8_t pill = 0; result == DispenseError::None && pill < pillsPerDose; ++pill) {
    bool pillDetected = false;
    for (uint8_t attempt = 1; attempt <= DeviceConfig::DISPENSE_MAX_ATTEMPTS && !pillDetected; ++attempt) {
      log_.printf("-- Pastilla %u/%u, intento %u/%u --\n",
          pill + 1, pillsPerDose, attempt, DeviceConfig::DISPENSE_MAX_ATTEMPTS);
      if (!dispenseOne(compartment, size, pillDetected)) {
        result = DispenseError::Motion;
        break;
      }
    }
    if (result == DispenseError::None && !pillDetected) result = DispenseError::PillNotDetected;
    if (result == DispenseError::None) ++pillsDetected;
  }

  if (result == DispenseError::None) {
    log_.printf("== LISTO: %u pastilla(s) dispensada(s) ==\n", pillsDetected);
    audio_.playTrack(DeviceConfig::AUDIO_TRACK_PILL_DISPENSED, DeviceConfig::AUDIO_VOLUME);
    display_.showMessage("LISTO", "TOME SU", "PASTILLA", DeviceConfig::OUTPUT_LIGHT_DURATION_MS);
  } else {
    log_.printf("== ERROR: %s ==\n",
        result == DispenseError::PillNotDetected ? "no se detecto la pastilla tras 3 intentos"
        : result == DispenseError::FeederHome ? "no se encontro HOME del disco"
        : result == DispenseError::CarouselHome ? "no se encontro HOME del carrusel"
        : "fallo mecanico");
    audio_.playTrack(DeviceConfig::AUDIO_TRACK_DISPENSE_ERROR, DeviceConfig::AUDIO_VOLUME);
    display_.showMessage("ERROR", "REVISE EL", "DISPENSADOR", 30000);
  }
  return result;
}
