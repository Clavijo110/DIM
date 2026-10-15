
const int PIN_SENSOR = 21;

int estadoAnterior = -1;

void setup() {
  Serial.begin(115200);
  pinMode(PIN_SENSOR, INPUT);

  delay(500);
  Serial.println("=== PRUEBA SENSOR IR FLYING-FISH ===");
  Serial.println("ESP32 - GPIO 21");
  Serial.println("Acerca y aleja un objeto del sensor.");
}

void loop() {
  int estadoActual = digitalRead(PIN_SENSOR);

  if (estadoActual != estadoAnterior) {
    Serial.print("Estado del sensor: ");
    Serial.println(estadoActual);

    if (estadoActual == LOW) {
      Serial.println("DETECCION ACTIVADA");
    } else {
      Serial.println("SIN DETECCION");
    }

    Serial.println("------------------------");
    estadoAnterior = estadoActual;
  }

  delay(20);
}
