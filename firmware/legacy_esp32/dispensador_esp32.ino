#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <ESP32Servo.h>

const char* WIFI_SSID = "TU_RED_WIFI";
const char* WIFI_PASSWORD = "TU_PASSWORD_WIFI";
const char* SUPABASE_URL = "https://vkfiybgtpctxfoftqqgdgm.supabase.co/rest/v1";
const char* SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZrZml5Ymd0cGN0eG9mdHF4Z2RtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAzMTUzOTQsImV4cCI6MjEwNTg5MTM5NH0.SWeNFt3qHasr-IIdAG69dA_Ig2bB--SliWCGuQ7Nr_8";

const int SERVO_PIN = 13;
const int BUZZER_PIN = 25;
const int DISABLE_HOURS_START = 0;
const int DISABLE_HOURS_END = 6;

Servo dispenserServo;

int slotToAngle(int slot) {
  return (slot - 1) * 45;
}

bool isNightWindow() {
  int hour = millis() / 3600000 % 24;
  return hour >= DISABLE_HOURS_START && hour < DISABLE_HOURS_END;
}

void connectWifi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.println("Conectando a Wi-Fi...");

  for (int i = 0; i < 30 && WiFi.status() != WL_CONNECTED; i++) {
    delay(500);
    Serial.print(".");
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println();
    Serial.println("Wi‑Fi conectada");
  } else {
    Serial.println();
    Serial.println("No se pudo conectar a Wi‑Fi");
  }
}

void playReminderSound() {
  tone(BUZZER_PIN, 1047, 200);
  delay(220);
  tone(BUZZER_PIN, 1318, 220);
  delay(240);
  tone(BUZZER_PIN, 1568, 260);
  delay(280);
  noTone(BUZZER_PIN);
}

void logEvent(int slot, const String& medName) {
  if (WiFi.status() != WL_CONNECTED) {
    return;
  }

  StaticJsonDocument<256> doc;
  doc["slot"] = slot;
  doc["medication_name"] = medName;
  doc["message"] = "Recordatorio: toma tu medicina.";
  doc["created_at"] = "now";

  String payload;
  serializeJson(doc, payload);

  HTTPClient http;
  http.begin(String(SUPABASE_URL) + "/dispense_events");
  http.addHeader("Content-Type", "application/json");
  http.addHeader("apikey", SUPABASE_ANON_KEY);
  http.addHeader("Authorization", "Bearer " + String(SUPABASE_ANON_KEY));

  int httpCode = http.POST(payload);
  if (httpCode > 0) {
    Serial.println("Evento enviado a Supabase");
  } else {
    Serial.println("Fallo al enviar evento");
  }

  http.end();
}

void dispenseSlot(int slot, const String& medName) {
  if (isNightWindow()) {
    Serial.println("Bloqueado por horario nocturno: 00:00 - 06:00");
    return;
  }

  int angle = slotToAngle(slot);
  dispenserServo.write(angle);
  delay(600);
  dispenserServo.write(0);
  delay(200);

  playReminderSound();
  logEvent(slot, medName);
}

void setup() {
  Serial.begin(115200);
  ESP32PWM::allocateTimer(0);
  dispenserServo.setPeriodHertz(50);
  dispenserServo.attach(SERVO_PIN, 500, 2400);
  pinMode(BUZZER_PIN, OUTPUT);
  connectWifi();
  dispenserServo.write(0);
}

void loop() {
  static bool once = false;

  if (!once) {
    dispenseSlot(3, "Losartan");
    once = true;
  }

  delay(30000);
}
