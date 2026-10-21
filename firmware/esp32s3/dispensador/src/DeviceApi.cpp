#include "DeviceApi.h"
#include "DeviceConfig.h"
#include <ArduinoJson.h>
#include <RTClib.h>
#include <WiFi.h>
#include <cstring>

namespace {
const char* AUTH_HEADERS[] = {"Authorization"};
constexpr char API_BASE[] = "/api/v1";

bool parsePillSize(const char* value, PillSize& size) {
  if (value == nullptr) return false;
  if (strcmp(value, "large") == 0) size = PillSize::Large;
  else if (strcmp(value, "small") == 0) size = PillSize::Small;
  else if (strcmp(value, "medium") == 0) size = PillSize::Medium;
  else return false;
  return true;
}
}

DeviceApi::DeviceApi(CarouselService& carousel, FeederService& feeder,
    SensorService& sensors, ClockService& clock, ScheduleService& schedules,
    DispenseService& dispenser, IndicatorService& indicators, AudioService& audio)
    : carousel_(carousel), feeder_(feeder), sensors_(sensors), clock_(clock), schedules_(schedules),
      dispenser_(dispenser), indicators_(indicators), audio_(audio) {}

void DeviceApi::addCorsHeaders() {
  server_.sendHeader("Access-Control-Allow-Origin", "*");
  server_.sendHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  server_.sendHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  server_.sendHeader("Cache-Control", "no-store");
}

bool DeviceApi::authorized() {
  const String key = DeviceConfig::DEVICE_API_KEY;
  if (key.length() < 16 || key.startsWith("CAMBIA")) {
    sendError(503, "Configura una clave local de al menos 16 caracteres en DeviceSecrets.h");
    return false;
  }
  String expectedAuthorization = "Bearer ";
  expectedAuthorization += key;
  if (server_.header("Authorization") != expectedAuthorization) {
    sendError(401, "Clave local no valida");
    return false;
  }
  return true;
}

void DeviceApi::sendError(uint16_t status, const char* message) {
  JsonDocument response;
  response["error"] = message;
  String body;
  serializeJson(response, body);
  addCorsHeaders();
  server_.send(status, "application/json", body);
}

void DeviceApi::begin() {
  server_.collectHeaders(AUTH_HEADERS, 1);
  const char* paths[] = {"/status", "/carousel/home", "/carousel/position", "/carousel/vibrate",
      "/carousel/compartment", "/carousel/test", "/feeder/home", "/feeder/position",
      "/dispense", "/clock", "/schedule", "/schedule/once", "/schedule/once/cancel",
      "/indicators/compartment",
      "/indicators/output", "/audio/play"};
  for (const char* path : paths) {
    server_.on((String(API_BASE) + path).c_str(), HTTP_OPTIONS, [this]() {
      addCorsHeaders();
      server_.send(204);
    });
  }

  server_.on((String(API_BASE) + "/status").c_str(), HTTP_GET, [this]() { handleStatus(); });
  server_.on((String(API_BASE) + "/carousel/home").c_str(), HTTP_POST, [this]() { handleCarouselHome(); });
  server_.on((String(API_BASE) + "/carousel/position").c_str(), HTTP_POST, [this]() { handleCarouselPosition(); });
  server_.on((String(API_BASE) + "/carousel/vibrate").c_str(), HTTP_POST, [this]() { handleCarouselVibrate(); });
  server_.on((String(API_BASE) + "/carousel/compartment").c_str(), HTTP_POST, [this]() { handleCarouselCompartment(); });
  server_.on((String(API_BASE) + "/carousel/test").c_str(), HTTP_POST, [this]() { handleCarouselTest(); });
  server_.on((String(API_BASE) + "/feeder/home").c_str(), HTTP_POST, [this]() { handleFeederHome(); });
  server_.on((String(API_BASE) + "/feeder/position").c_str(), HTTP_POST, [this]() { handleFeederPosition(); });
  server_.on((String(API_BASE) + "/dispense").c_str(), HTTP_POST, [this]() { handleDispense(); });
  server_.on((String(API_BASE) + "/clock").c_str(), HTTP_POST, [this]() { handleClockSync(); });
  server_.on((String(API_BASE) + "/schedule").c_str(), HTTP_POST, [this]() { handleSchedules(); });
  server_.on((String(API_BASE) + "/schedule/once").c_str(), HTTP_POST,
      [this]() { handleScheduleOnce(); });
  server_.on((String(API_BASE) + "/schedule/once/cancel").c_str(), HTTP_POST,
      [this]() { handleCancelScheduleOnce(); });
  server_.on((String(API_BASE) + "/indicators/compartment").c_str(), HTTP_POST,
      [this]() { handleIndicateCompartment(); });
  server_.on((String(API_BASE) + "/indicators/output").c_str(), HTTP_POST,
      [this]() { handleTestOutputIndicator(); });
  server_.on((String(API_BASE) + "/audio/play").c_str(), HTTP_POST,
      [this]() { handleAudioTest(); });
  server_.onNotFound([this]() { sendError(404, "Ruta no encontrada"); });
  server_.begin();
}

void DeviceApi::loop() { server_.handleClient(); }

void DeviceApi::handleStatus() {
  if (!authorized()) return;
  JsonDocument response;
  response["firmwareVersion"] = "DIM-ESP32S3-7";
  const wifi_mode_t wifiMode = WiFi.getMode();
  const bool stationConnected = WiFi.status() == WL_CONNECTED;
  const bool accessPointActive = wifiMode == WIFI_AP || wifiMode == WIFI_AP_STA;
  response["connected"] = stationConnected || accessPointActive;
  response["stationConnected"] = stationConnected;
  response["stationIp"] = stationConnected ? WiFi.localIP().toString() : "";
  response["accessPointIp"] = accessPointActive ? WiFi.softAPIP().toString() : "";
  response["hostName"] = "Dispensador.local";
  response["carouselPosition"] = carousel_.position();
  response["carouselHomed"] = carousel_.homed();
  response["scheduleReady"] =
      carousel_.homed() && feeder_.homed() && clock_.valid() && schedules_.clockAligned();
  response["scheduleClockAligned"] = schedules_.clockAligned();
  response["feederPosition"] = feeder_.positionSteps();
  response["feederHomed"] = feeder_.homed();
  response["busy"] = false;
  response["sensors"]["carouselHome"] = sensors_.carouselHome();
  response["sensors"]["feederHome"] = sensors_.feederHome();
  response["sensors"]["pillDetected"] = sensors_.pillDetected();
  response["clock"]["valid"] = clock_.valid();
  response["clock"]["iso"] = clock_.isoUtc();
  response["clock"]["unixTime"] = clock_.unixTime();
  response["clock"]["localUnixTime"] = clock_.localNow().unixtime();
  response["clock"]["timezoneOffsetMinutes"] = clock_.timezoneOffsetMinutes();
  response["scheduleCount"] = schedules_.enabledCount();
  const MedicationScheduleState* next = schedules_.nextDue();
  if (next != nullptr) {
    response["nextMedication"] = next->medicationName;
    response["nextDue"] = next->nextDue;
  }
  JsonArray scheduleArray = response["schedules"].to<JsonArray>();
  for (uint8_t slot = 1; slot <= DeviceConfig::MEDICATION_COMPARTMENT_COUNT; ++slot) {
    const MedicationScheduleState& schedule = schedules_.state(slot);
    JsonObject item = scheduleArray.add<JsonObject>();
    item["compartment"] = slot;
    item["enabled"] = schedule.enabled;
    item["faulted"] = schedule.faulted;
    item["medicationName"] = schedule.medicationName;
    item["remaining"] = schedule.amount;
    item["pillsPerDose"] = schedule.pillsPerDose;
    item["nextDue"] = schedule.nextDue;
  }
  const OneTimeScheduleState& oneTime = schedules_.oneTime();
  JsonObject oneTimeResponse = response["oneTimeSchedule"].to<JsonObject>();
  oneTimeResponse["enabled"] = oneTime.enabled;
  oneTimeResponse["faulted"] = oneTime.faulted;
  if (oneTime.enabled) {
    oneTimeResponse["compartment"] = oneTime.compartment;
    oneTimeResponse["medicationName"] = schedules_.state(oneTime.compartment).medicationName;
    oneTimeResponse["nextDue"] = oneTime.nextDue;
  }
  String body;
  serializeJson(response, body);
  addCorsHeaders();
  server_.send(200, "application/json", body);
}

void DeviceApi::handleCarouselHome() {
  if (!authorized()) return;
  // Un solo HOME: primero se cierra el disco y luego se referencia el carrusel.
  if (!feeder_.home()) return sendError(504, "No se encontro HOME del motor receptor");
  if (!carousel_.home()) return sendError(504, "No se encontro la referencia del carrusel");
  addCorsHeaders();
  server_.send(200, "application/json", "{\"accepted\":true,\"carouselPosition\":0}");
}

void DeviceApi::handleCarouselPosition() {
  if (!authorized()) return;
  JsonDocument request;
  if (deserializeJson(request, server_.arg("plain"))) return sendError(400, "JSON invalido");
  const JsonVariantConst positionValue = request["position"];
  if (!positionValue.is<int>()) return sendError(422, "La posicion debe ser un entero");
  const int position = positionValue.as<int>();
  if (position < 0 || position >= DeviceConfig::CAROUSEL_POSITION_COUNT) {
    return sendError(422, "La posicion debe estar entre 0 y 7");
  }
  if (!carousel_.homed()) return sendError(409, "Referencia primero el carrusel");
  if (!carousel_.moveToPosition(position)) return sendError(500, "No se pudo mover el carrusel");
  addCorsHeaders();
  server_.send(200, "application/json", "{\"accepted\":true}");
}

void DeviceApi::handleCarouselVibrate() {
  if (!authorized()) return;
  if (!carousel_.vibrateInPlace()) return sendError(409, "Referencia primero el carrusel");
  addCorsHeaders();
  server_.send(200, "application/json", "{\"accepted\":true,\"completed\":true}");
}

void DeviceApi::handleCarouselCompartment() {
  if (!authorized()) return;
  JsonDocument request;
  if (deserializeJson(request, server_.arg("plain"))) return sendError(400, "JSON invalido");
  const JsonVariantConst compartmentValue = request["compartment"];
  if (!compartmentValue.is<int>()) return sendError(422, "El compartimento debe ser un entero");
  const int compartment = compartmentValue.as<int>();
  if (compartment < 1 || compartment > DeviceConfig::MEDICATION_COMPARTMENT_COUNT) {
    return sendError(422, "El compartimento debe estar entre 1 y 7");
  }
  if (!carousel_.runCompartmentCycle(compartment)) return sendError(504, "Fallo el ciclo del carrusel o no se encontro HOME");
  addCorsHeaders();
  server_.send(200, "application/json", "{\"accepted\":true,\"completed\":true,\"carouselPosition\":0}");
}

void DeviceApi::handleCarouselTest() {
  if (!authorized()) return;
  if (!carousel_.testAllCompartments()) return sendError(504, "Fallo la prueba del carrusel");
  addCorsHeaders();
  server_.send(200, "application/json", "{\"accepted\":true,\"completed\":true,\"carouselPosition\":0}");
}

void DeviceApi::handleFeederHome() {
  if (!authorized()) return;
  if (!feeder_.home()) return sendError(504, "No se encontro HOME del motor receptor");
  addCorsHeaders();
  server_.send(200, "application/json", "{\"accepted\":true}");
}

void DeviceApi::handleFeederPosition() {
  if (!authorized()) return;
  JsonDocument request;
  if (deserializeJson(request, server_.arg("plain"))) return sendError(400, "JSON invalido");
  PillSize size;
  if (!parsePillSize(request["pillSize"].as<const char*>(), size)) {
    return sendError(422, "El tamaño debe ser large, small o medium");
  }
  if (!feeder_.homed()) return sendError(409, "Referencia primero el motor receptor");
  if (carousel_.position() != 0) return sendError(409, "Lleva primero el carrusel a la salida vacia para probar el disco");
  if (!feeder_.runPositionCycle(size)) return sendError(504, "Fallo el ciclo de prueba del disco receptor");
  addCorsHeaders();
  server_.send(200, "application/json", "{\"accepted\":true,\"completed\":true}");
}

void DeviceApi::handleDispense() {
  if (!authorized()) return;
  JsonDocument request;
  if (deserializeJson(request, server_.arg("plain"))) return sendError(400, "JSON invalido");
  const JsonVariantConst compartmentValue = request["compartment"];
  if (!compartmentValue.is<int>()) return sendError(422, "El compartimento debe ser un entero");
  PillSize pillSize;
  if (!parsePillSize(request["pillSize"].as<const char*>(), pillSize)) {
    return sendError(422, "El tamaño debe ser large, small o medium");
  }
  const JsonVariantConst pillsPerDoseValue = request["pillsPerDose"];
  if (!pillsPerDoseValue.is<int>()) return sendError(422, "La cantidad de pastillas por toma debe ser un entero");
  const int compartment = compartmentValue.as<int>();
  const int pillsPerDose = pillsPerDoseValue.as<int>();
  if (compartment < 1 || compartment > DeviceConfig::MEDICATION_COMPARTMENT_COUNT) {
    return sendError(422, "El compartimento debe estar entre 1 y 7");
  }
  if (pillsPerDose < 1 || pillsPerDose > 60) {
    return sendError(422, "La toma debe incluir entre 1 y 60 pastillas");
  }
  if (!feeder_.homed()) return sendError(409, "Referencia el motor receptor antes de dispensar");
  if (!schedules_.beginDispense(
          compartment, static_cast<uint8_t>(pillsPerDose), pillSize)) {
    return sendError(409, "El compartimento programado esta agotado, requiere revision o no coincide con la toma configurada");
  }
  uint8_t pillsDetected = 0;
  const DispenseError dispenseError = dispenser_.run(
      compartment, pillSize, static_cast<uint8_t>(pillsPerDose), pillsDetected);
  if (dispenseError != DispenseError::None || pillsDetected != pillsPerDose) {
    schedules_.failDispense(compartment);
    if (dispenseError == DispenseError::PillNotDetected) {
      return sendError(504, "El sensor no detecto la caida tras 3 intentos. Ciclo detenido; revisa la dosis y el inventario antes de continuar.");
    }
    return sendError(504, "Fallo el ciclo mecanico. Se detuvo; revisa el dispositivo antes de continuar.");
  }
  const bool scheduleStateSaved = schedules_.completeDispense(
      compartment, static_cast<uint8_t>(pillsPerDose), clock_.localNow().unixtime(), false);

  JsonDocument response;
  response["accepted"] = true;
  response["completed"] = true;
  response["compartment"] = compartment;
  response["pillSize"] = request["pillSize"];
  response["pillsDispensed"] = pillsDetected;
  response["scheduleStateSaved"] = scheduleStateSaved;
  String body;
  serializeJson(response, body);
  addCorsHeaders();
  server_.send(200, "application/json", body);
}

void DeviceApi::handleClockSync() {
  if (!authorized()) return;
  if (schedules_.oneTime().enabled) {
    return sendError(409, "Cancela la toma unica pendiente antes de cambiar el reloj");
  }
  JsonDocument request;
  if (deserializeJson(request, server_.arg("plain"))) return sendError(400, "JSON invalido");
  if (!request["unixTime"].is<uint32_t>() || !request["timezoneOffsetMinutes"].is<int>()) {
    return sendError(422, "Faltan la hora UNIX o la zona horaria");
  }
  const uint32_t unixTime = request["unixTime"].as<uint32_t>();
  const int timezoneOffset = request["timezoneOffsetMinutes"].as<int>();
  if (!clock_.setUnixTime(unixTime, timezoneOffset)) return sendError(422, "Hora o zona horaria invalida");
  if (!schedules_.rebase(clock_.localNow().unixtime())) {
    return sendError(500, "La hora se ajusto, pero no se pudieron recalcular las proximas tomas; la dispensacion automatica queda pausada");
  }
  addCorsHeaders();
  server_.send(200, "application/json", "{\"accepted\":true}");
}

void DeviceApi::handleSchedules() {
  if (!authorized()) return;
  if (schedules_.oneTime().enabled) {
    return sendError(409, "Cancela la toma unica pendiente antes de reemplazar la agenda");
  }
  JsonDocument request;
  if (deserializeJson(request, server_.arg("plain"))) return sendError(400, "JSON invalido");
  JsonArrayConst input = request["schedules"].as<JsonArrayConst>();
  if (input.isNull() || input.size() > DeviceConfig::MEDICATION_COMPARTMENT_COUNT) {
    return sendError(422, "La agenda debe incluir una lista de hasta siete compartimentos");
  }
  if (input.size() > 0 && !clock_.valid()) return sendError(409, "Sincroniza el reloj desde la app antes de instalar la agenda");

  MedicationScheduleInput schedules[DeviceConfig::MEDICATION_COMPARTMENT_COUNT]{};
  bool seen[DeviceConfig::MEDICATION_COMPARTMENT_COUNT]{};
  uint8_t count = 0;
  for (JsonVariantConst item : input) {
    if (!item["compartment"].is<int>() || !item["medicationName"].is<const char*>()
        || !item["startHour"].is<int>() || !item["startMinute"].is<int>()
        || !item["frequencyHours"].is<int>() || !item["pillsPerDose"].is<int>()
        || !item["amount"].is<int>()) {
      return sendError(422, "Faltan datos requeridos para un compartimento");
    }
    const int compartment = item["compartment"].as<int>();
    const char* medicationName = item["medicationName"].as<const char*>();
    PillSize pillSize;
    const int startHour = item["startHour"].as<int>();
    const int startMinute = item["startMinute"].as<int>();
    const int frequencyHours = item["frequencyHours"].as<int>();
    const int pillsPerDose = item["pillsPerDose"].as<int>();
    const int amount = item["amount"].as<int>();
    if (!parsePillSize(item["pillSize"].as<const char*>(), pillSize)
        || medicationName == nullptr || strlen(medicationName) == 0
        || strlen(medicationName) >= 25
        || compartment < 1 || compartment > DeviceConfig::MEDICATION_COMPARTMENT_COUNT
        || startHour < 0 || startHour > 23
        || startMinute < 0 || startMinute > 59 || frequencyHours < 1 || frequencyHours > 168
        || pillsPerDose < 1 || pillsPerDose > 60 || amount < pillsPerDose
        || amount > 60 || seen[compartment - 1]) {
      return sendError(422, "Hay valores invalidos o compartimentos duplicados en la agenda");
    }
    seen[compartment - 1] = true;
    MedicationScheduleInput& schedule = schedules[count++];
    schedule.compartment = static_cast<uint8_t>(compartment);
    snprintf(schedule.medicationName, sizeof(schedule.medicationName), "%s", medicationName);
    schedule.pillSize = pillSize;
    schedule.startHour = static_cast<uint8_t>(startHour);
    schedule.startMinute = static_cast<uint8_t>(startMinute);
    schedule.frequencyHours = static_cast<uint8_t>(frequencyHours);
    schedule.pillsPerDose = static_cast<uint8_t>(pillsPerDose);
    schedule.amount = static_cast<uint8_t>(amount);
  }

  if (!schedules_.replace(schedules, count, clock_.localNow().unixtime())) {
    return sendError(500, "No se pudo guardar la agenda en memoria persistente");
  }
  JsonDocument response;
  response["accepted"] = true;
  response["scheduleCount"] = count;
  String body;
  serializeJson(response, body);
  addCorsHeaders();
  server_.send(200, "application/json", body);
}

void DeviceApi::handleScheduleOnce() {
  if (!authorized()) return;
  if (!clock_.valid()) return sendError(409, "Sincroniza el reloj desde la app antes de programar una toma");
  JsonDocument request;
  if (deserializeJson(request, server_.arg("plain"))) return sendError(400, "JSON invalido");
  if (!request["compartment"].is<int>() || !request["minutesFromNow"].is<int>()) {
    return sendError(422, "Indica el compartimento y los minutos hasta la toma");
  }
  const int compartment = request["compartment"].as<int>();
  const int minutesFromNow = request["minutesFromNow"].as<int>();
  if (compartment < 1 || compartment > DeviceConfig::MEDICATION_COMPARTMENT_COUNT) {
    return sendError(422, "El compartimento debe estar entre 1 y 7");
  }
  if (minutesFromNow < 1 || minutesFromNow > 7 * 24 * 60) {
    return sendError(422, "Los minutos deben estar entre 1 y 10080");
  }
  const uint32_t localNow = clock_.localNow().unixtime();
  const uint32_t dueAt = localNow + static_cast<uint32_t>(minutesFromNow) * 60UL;
  if (!schedules_.scheduleOnce(static_cast<uint8_t>(compartment), dueAt, localNow)) {
    return sendError(409, "No se pudo programar: sincroniza la agenda, revisa el saldo o resuelve la toma pendiente");
  }
  addCorsHeaders();
  server_.send(200, "application/json", "{\"accepted\":true}");
}

void DeviceApi::handleCancelScheduleOnce() {
  if (!authorized()) return;
  if (!schedules_.cancelOneTime()) return sendError(409, "No hay una toma unica cancelable");
  addCorsHeaders();
  server_.send(200, "application/json", "{\"accepted\":true}");
}

void DeviceApi::handleIndicateCompartment() {
  if (!authorized()) return;
  JsonDocument request;
  if (deserializeJson(request, server_.arg("plain"))) return sendError(400, "JSON invalido");
  const JsonVariantConst compartmentValue = request["compartment"];
  if (!compartmentValue.is<int>()) return sendError(422, "El compartimento debe ser un entero");
  const int compartment = compartmentValue.as<int>();
  if (compartment < 1 || compartment > DeviceConfig::MEDICATION_COMPARTMENT_COUNT) {
    return sendError(422, "El compartimento debe estar entre 1 y 7");
  }
  if (!indicators_.indicateCompartment(static_cast<uint8_t>(compartment))) {
    return sendError(500, "No se pudo indicar el compartimento");
  }
  addCorsHeaders();
  server_.send(200, "application/json", "{\"accepted\":true}");
}

void DeviceApi::handleTestOutputIndicator() {
  if (!authorized()) return;
  indicators_.indicatePillOutput();
  addCorsHeaders();
  server_.send(200, "application/json", "{\"accepted\":true,\"durationMs\":10000}");
}

void DeviceApi::handleAudioTest() {
  if (!authorized()) return;
  JsonDocument request;
  if (deserializeJson(request, server_.arg("plain"))) return sendError(400, "JSON invalido");
  if (!request["track"].is<int>() || !request["volume"].is<int>()) {
    return sendError(422, "Indica el numero de pista y el volumen");
  }
  const int track = request["track"].as<int>();
  const int volume = request["volume"].as<int>();
  if (track < 1 || track > 255 || volume < 0 || volume > 30) {
    return sendError(422, "La pista debe estar entre 1 y 255 y el volumen entre 0 y 30");
  }
  if (!audio_.playTrack(static_cast<uint16_t>(track), static_cast<uint8_t>(volume))) {
    return sendError(503, "El modulo de audio no esta disponible");
  }
  addCorsHeaders();
  server_.send(200, "application/json", "{\"accepted\":true}");
}