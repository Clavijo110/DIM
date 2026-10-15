#include <Arduino.h>

// ESP32-S3 + 28BYJ-48 + ULN2003 + sensor optico
const uint8_t IN1 = 6;
const uint8_t IN2 = 7;
const uint8_t IN3 = 15;
const uint8_t IN4 = 16;
const uint8_t SENSOR_PIN = 20;

// Fototransistor NPN con pull-up externo a 3.3 V.
// HIGH = haz bloqueado por la pestana; LOW = haz recibido.
const bool SENSOR_BLOQUEADO_HIGH = true;
const uint16_t STEP_DELAY_MS = 3;
const uint32_t MAX_HOME_STEPS = 12000;
const long PASOS_POR_VUELTA = 4096;

uint8_t fase = 0;
long posicionPasos = 0;
String lineaSerial;
bool homeEncontrado = false;

const uint8_t secuencia[8][4] = {
    {1, 0, 0, 0},
    {1, 1, 0, 0},
    {0, 1, 0, 0},
    {0, 1, 1, 0},
    {0, 0, 1, 0},
    {0, 0, 1, 1},
    {0, 0, 0, 1},
    {1, 0, 0, 1}};

bool sensorEnHome() {
  const bool nivel = digitalRead(SENSOR_PIN);
  return SENSOR_BLOQUEADO_HIGH ? nivel == HIGH : nivel == LOW;
}

bool leerHomeEstable() {
  const bool primera = sensorEnHome();
  delay(2);
  const bool segunda = sensorEnHome();
  delay(2);
  const bool tercera = sensorEnHome();

  return primera == segunda && segunda == tercera
             ? primera
             : tercera;
}

void escribirFase() {
  digitalWrite(IN1, secuencia[fase][0]);
  digitalWrite(IN2, secuencia[fase][1]);
  digitalWrite(IN3, secuencia[fase][2]);
  digitalWrite(IN4, secuencia[fase][3]);
}

void detenerMotor() {
  digitalWrite(IN1, LOW);
  digitalWrite(IN2, LOW);
  digitalWrite(IN3, LOW);
  digitalWrite(IN4, LOW);
}

void pasoAntihorario() {
  fase = (fase + 7) % 8;
  escribirFase();
  delay(STEP_DELAY_MS);
  posicionPasos++;
}

bool buscarHome() {
  Serial.println("Buscando HOME...");

  // Si el sensor ya indica HOME al arrancar, no mueve el motor.
  if (leerHomeEstable()) {
    detenerMotor();
    posicionPasos = 0;
    homeEncontrado = true;
    Serial.println("HOME ya detectado. Motor detenido.");
    return true;
  }

  for (uint32_t pasos = 0; pasos < MAX_HOME_STEPS; pasos++) {
    pasoAntihorario();

    if (leerHomeEstable()) {
      detenerMotor();
      posicionPasos = 0;
      homeEncontrado = true;
      Serial.print("HOME detectado. Pasos realizados: ");
      Serial.println(pasos + 1);
      Serial.println("Motor detenido.");
      return true;
    }
  }

  detenerMotor();
  homeEncontrado = false;
  Serial.println("ERROR: no se detecto HOME dentro del limite de pasos.");
  Serial.println("Motor detenido por seguridad.");
  return false;
}

void irAPosicion(uint8_t posicion) {
  if (!homeEncontrado) {
    Serial.println("Movimiento bloqueado: primero debe detectarse HOME.");
    return;
  }

  if (posicion < 1 || posicion > 4) {
    Serial.println("Posicion invalida. Envie 1, 2, 3 o 4.");
    return;
  }

  const long pasosPorPosicion = PASOS_POR_VUELTA / 4;
  const long destino = (posicion % 4) * pasosPorPosicion;
  long actual = posicionPasos % PASOS_POR_VUELTA;
  if (actual < 0) {
    actual += PASOS_POR_VUELTA;
  }

  long pasosMover = destino - actual;
  if (pasosMover < 0) {
    pasosMover += PASOS_POR_VUELTA;
  }
  if (posicion == 4 && pasosMover == 0) {
    pasosMover = PASOS_POR_VUELTA;
  }

  Serial.print("Moviendo a posicion ");
  Serial.print(posicion);
  Serial.print(" (");
  Serial.print(posicion * 90);
  Serial.println(" grados desde HOME).");
  Serial.print("Medios pasos: ");
  Serial.println(pasosMover);

  for (long i = 0; i < pasosMover; i++) {
    pasoAntihorario();
  }

  posicionPasos = destino;
  detenerMotor();
  Serial.println("Posicion alcanzada. Motor detenido.");

  Serial.println("Esperando 2 segundos...");
  delay(2000);

  const long pasosMediaVuelta = PASOS_POR_VUELTA / 2;
  Serial.println("Girando 180 grados...");
  for (long i = 0; i < pasosMediaVuelta; i++) {
    pasoAntihorario();
  }

  detenerMotor();
  Serial.println("Giro de 180 grados terminado. Esperando 2 segundos antes de regresar a HOME...");
  delay(2000);
  Serial.println("Regresando a la posicion 4 (HOME)...");
  buscarHome();
}

void procesarLineaSerial(String comando) {
  comando.trim();

  if (comando.length() == 1 &&
      comando[0] >= '1' && comando[0] <= '4') {
    irAPosicion((uint8_t)(comando[0] - '0'));
    return;
  }

  if (comando == "HOME") {
    buscarHome();
    return;
  }

  Serial.println("Comando invalido. Envie 1, 2, 3 o 4; HOME busca el origen.");
}

void setup() {
  Serial.begin(115200);

  pinMode(IN1, OUTPUT);
  pinMode(IN2, OUTPUT);
  pinMode(IN3, OUTPUT);
  pinMode(IN4, OUTPUT);
  pinMode(SENSOR_PIN, INPUT);

  detenerMotor();
  delay(300);
  if (buscarHome()) {
    Serial.println("Listo. Envie 1, 2, 3 o 4 por el Monitor Serial.");
    Serial.println("Cada numero selecciona una posicion absoluta de 90 grados.");
    Serial.println("La posicion 4 vuelve a HOME tras una vuelta completa.");
    Serial.println("Los 4096 medios pasos por vuelta son un valor aproximado.");
  }
}

void loop() {
  while (Serial.available() > 0) {
    const char caracter = Serial.read();

    if (caracter == '\n' || caracter == '\r' || caracter == ' ' || caracter == '\t') {
      if (lineaSerial.length() > 0) {
        procesarLineaSerial(lineaSerial);
        lineaSerial = "";
      }
    }
    else if (lineaSerial.length() < 16) {
      lineaSerial += caracter;
    }
  }
}
