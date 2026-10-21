#include "SerialConsole.h"
#include "DeviceConfig.h"
#include <WiFi.h>
#include <cstdlib>
#include <cstring>

SerialConsole::SerialConsole(Stream& io, CarouselService& carousel, FeederService& feeder,
    SensorService& sensors, IndicatorService& indicators, AudioService& audio,
    DispenseService& dispenser, ClockService& clock)
    : io_(io), carousel_(carousel), feeder_(feeder), sensors_(sensors),
      indicators_(indicators), audio_(audio), dispenser_(dispenser), clock_(clock) {}

void SerialConsole::begin() {
  io_.println("\n=== DIM dispensador - consola serial UART0 ===");
  printHelp();
}

void SerialConsole::poll() {
  while (io_.available() > 0) {
    const char ch = static_cast<char>(io_.read());
    if (ch == '\r') continue;
    if (ch == '\n') {
      buffer_[length_] = '\0';
      if (length_ > 0) execute(buffer_);
      length_ = 0;
    } else if (length_ < sizeof(buffer_) - 1) {
      buffer_[length_++] = static_cast<char>(toupper(static_cast<unsigned char>(ch)));
    }
  }
}

void SerialConsole::printHelp() {
  io_.println("Comandos (mayusculas o minusculas):");
  io_.println("  HOME                      Disco a HOME y cerrado, luego carrusel a HOME");
  io_.println("  DISPENSAR <1-7> <P|M|G> [cantidad]   Ej: DISPENSAR 3 M   (P=pequena M=mediana G=grande/capsula)");
  io_.println("  PROGRAMAR <1-7>           Enciende la luz del contenedor a llenar (Q1-Q7)");
  io_.println("  SALIDA                    Enciende la luz de salida Q0 por 10 s");
  io_.println("  APAGAR                    Apaga todas las luces");
  io_.println("  CONTENEDOR <1-7>          Prueba del carrusel sin disco (ida, 22,5, vibra, regreso)");
  io_.println("  DISCO <P|M|G>             Prueba del disco (requiere HOME): cavidad, 180, cerrado");
  io_.println("  SENSORES                  Lee los 3 sensores");
  io_.println("  ESTADO                    Referencias, posiciones, red y hora");
  io_.println("  AUDIO <n>                 Reproduce la pista n de la carpeta 01");
}

void SerialConsole::printSensors() {
  io_.printf("Sensor HOME carrusel (GPIO%u): %s\n", DeviceConfig::CAROUSEL_HOME_PIN,
      sensors_.carouselHome() ? "BLOQUEADO (en referencia)" : "libre");
  io_.printf("Sensor HOME disco    (GPIO%u): %s\n", DeviceConfig::FEEDER_HOME_PIN,
      sensors_.feederHome() ? "EN MARCA" : "fuera de marca");
  io_.printf("Sensor de caida      (GPIO%u): %s, caidas contadas: %lu\n",
      DeviceConfig::PILL_SENSOR_PIN, sensors_.pillDetected() ? "INTERRUMPIDO" : "libre",
      static_cast<unsigned long>(sensors_.pillEventCount()));
}

void SerialConsole::printStatus() {
  io_.printf("Carrusel: %s, posicion %u\n", carousel_.homed() ? "referenciado" : "SIN HOME",
      carousel_.position());
  io_.printf("Disco: %s, pasos %ld\n", feeder_.homed() ? "referenciado" : "SIN HOME",
      feeder_.positionSteps());
  io_.printf("Wi-Fi AP: %s  |  Estacion: %s\n", WiFi.softAPIP().toString().c_str(),
      WiFi.status() == WL_CONNECTED ? WiFi.localIP().toString().c_str() : "sin conexion");
  if (clock_.valid()) {
    const DateTime now = clock_.localNow();
    io_.printf("Hora local: %02u:%02u:%02u %02u-%02u-%04u\n", now.hour(), now.minute(), now.second(),
        now.day(), now.month(), now.year());
  } else {
    io_.println("Hora: sin sincronizar (usa Sincronizar reloj en la app)");
  }
  printSensors();
}

bool SerialConsole::homeAll() {
  io_.println("Disco: buscando HOME y cerrando...");
  if (!feeder_.home()) {
    io_.println("ERROR: no se encontro HOME del disco (revisa el sensor GPIO19)");
    return false;
  }
  io_.println("Carrusel: buscando HOME...");
  if (!carousel_.home()) {
    io_.println("ERROR: no se encontro HOME del carrusel (revisa el sensor GPIO21)");
    return false;
  }
  io_.println("OK: disco cerrado y carrusel en el hueco");
  return true;
}

bool SerialConsole::parseSize(const char* text, PillSize& size) {
  if (text == nullptr) return false;
  if (!strcmp(text, "P") || !strcmp(text, "PEQUENA") || !strcmp(text, "SMALL")) {
    size = PillSize::Small;
  } else if (!strcmp(text, "M") || !strcmp(text, "MEDIANA") || !strcmp(text, "MEDIUM")) {
    size = PillSize::Medium;
  } else if (!strcmp(text, "G") || !strcmp(text, "GRANDE") || !strcmp(text, "C")
      || !strcmp(text, "CAPSULA") || !strcmp(text, "LARGE")) {
    size = PillSize::Large;
  } else {
    return false;
  }
  return true;
}

bool SerialConsole::parseCompartment(const char* text, uint8_t& compartment) {
  if (text == nullptr) return false;
  const int value = atoi(text);
  if (value < 1 || value > DeviceConfig::MEDICATION_COMPARTMENT_COUNT) return false;
  compartment = static_cast<uint8_t>(value);
  return true;
}

void SerialConsole::execute(char* line) {
  io_.printf("> %s\n", line);
  const char* command = strtok(line, " ");
  const char* arg1 = strtok(nullptr, " ");
  const char* arg2 = strtok(nullptr, " ");
  const char* arg3 = strtok(nullptr, " ");
  uint8_t compartment = 0;
  PillSize size;

  if (!strcmp(command, "AYUDA") || !strcmp(command, "?")) {
    printHelp();
  } else if (!strcmp(command, "ESTADO")) {
    printStatus();
  } else if (!strcmp(command, "SENSORES")) {
    printSensors();
  } else if (!strcmp(command, "HOME")) {
    homeAll();
  } else if (!strcmp(command, "DISPENSAR") || !strcmp(command, "D")) {
    if (!parseCompartment(arg1, compartment) || !parseSize(arg2, size)) {
      io_.println("Uso: DISPENSAR <1-7> <P|M|G> [cantidad]");
      return;
    }
    const int quantity = arg3 == nullptr ? 1 : atoi(arg3);
    if (quantity < 1 || quantity > 60) {
      io_.println("La cantidad debe estar entre 1 y 60");
      return;
    }
    uint8_t detected = 0;
    dispenser_.run(compartment, size, static_cast<uint8_t>(quantity), detected);
  } else if (!strcmp(command, "PROGRAMAR") || !strcmp(command, "LUZ")) {
    if (!parseCompartment(arg1, compartment)) {
      io_.println("Uso: PROGRAMAR <1-7>");
      return;
    }
    indicators_.indicateCompartment(compartment);
    io_.printf("Luz del contenedor %u encendida (Q%u)\n", compartment, compartment);
  } else if (!strcmp(command, "SALIDA")) {
    indicators_.indicatePillOutput();
    io_.println("Luz de salida Q0 encendida por 10 s");
  } else if (!strcmp(command, "APAGAR")) {
    indicators_.clearAll();
    io_.println("Luces apagadas");
  } else if (!strcmp(command, "CONTENEDOR")) {
    if (!parseCompartment(arg1, compartment)) {
      io_.println("Uso: CONTENEDOR <1-7>");
      return;
    }
    if (!feeder_.homed() && !feeder_.home()) {
      io_.println("ERROR: el disco no encontro HOME; no se mueve el carrusel con el disco abierto");
      return;
    }
    io_.println(carousel_.runCompartmentCycle(compartment) ? "OK: ciclo del carrusel completo"
                                                            : "ERROR: fallo el ciclo o no encontro HOME");
  } else if (!strcmp(command, "DISCO")) {
    if (!parseSize(arg1, size)) {
      io_.println("Uso: DISCO <P|M|G>");
      return;
    }
    if (!carousel_.homed() || carousel_.position() != 0 || !feeder_.homed()) {
      io_.println("Primero ejecuta HOME (carrusel en el hueco y disco referenciado)");
      return;
    }
    io_.println(feeder_.runPositionCycle(size) ? "OK: cavidad, giro 180 y cerrado"
                                               : "ERROR: fallo el ciclo del disco");
  } else if (!strcmp(command, "AUDIO")) {
    const int track = arg1 == nullptr ? 0 : atoi(arg1);
    io_.println(audio_.playTrack(static_cast<uint16_t>(track), DeviceConfig::AUDIO_VOLUME)
        ? "Orden de audio enviada" : "Uso: AUDIO <1-255>");
  } else {
    io_.println("Comando desconocido. Escribe AYUDA");
  }
}
