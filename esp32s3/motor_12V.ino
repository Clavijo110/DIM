const int STEP_PIN = 4;
const int DIR_PIN  = 5;
const int SENSOR   = 21;

// DRV8825 en 1/8 de micropaso:
// M0 = HIGH, M1 = HIGH, M2 = LOW
// M0 y M1 a 3.3 V; M2 a GND.

// Sensor KLH512: lógica comprobada
const int RANURA_BLOQUEADA = HIGH;
const int RANURA_LIBRE = LOW;

// LOW gira en sentido horario en este montaje; HIGH invierte el sentido.
const int DIR_ANTIHORARIO = HIGH;

// Motor NEMA 17 de 1.8 grados
const int PASOS_COMPLETOS_POR_VUELTA = 200;
const int MICROPASOS = 8;
const int PASOS_POR_VUELTA =
    PASOS_COMPLETOS_POR_VUELTA * MICROPASOS;

// Calibración: 257 pulsos produjeron aproximadamente 47 grados medidos.
const int PASOS_PRUEBA_CALIBRACION = 257;
const int GRADOS_MEDIDOS_EN_PRUEBA = 47;
const int PASOS_POR_45_GRADOS =
    (PASOS_PRUEBA_CALIBRACION * 45) / GRADOS_MEDIDOS_EN_PRUEBA;

// Temporización de búsqueda: se conserva la que funciona
const int PULSO_HIGH_US = 5;
const int RETARDO_BUSQUEDA_US = 8000;
const int MAX_PASOS_BUSQUEDA = 2 * PASOS_POR_VUELTA;
const int CONFIRMACION_MS = 5;

// Velocidad de movimiento entre compartimentos
const int RETARDO_INICIO_US = 12000;
const int RETARDO_RAPIDO_US = 5000;
const int PASOS_RAMPA = 30;

// Posición 0 + siete compartimentos
const int NUM_POSICIONES = 8;

int posicionActual = 0;
bool referenciaEncontrada = false;

// --------------------------------------------------
// Generar un micropaso
// --------------------------------------------------
void pasoMotor(int direccion, int retardo_us) {
  digitalWrite(DIR_PIN, direccion);
  delayMicroseconds(10);

  digitalWrite(STEP_PIN, HIGH);
  delayMicroseconds(PULSO_HIGH_US);
  digitalWrite(STEP_PIN, LOW);

  delayMicroseconds(retardo_us);
}

// --------------------------------------------------
// Buscar un estado del sensor
// --------------------------------------------------
bool buscarEstado(int estadoDeseado, int maxPasos) {
  for (int i = 0; i < maxPasos; i++) {
    if (digitalRead(SENSOR) == estadoDeseado) {
      delay(CONFIRMACION_MS);

      if (digitalRead(SENSOR) == estadoDeseado) {
        return true;
      }
    }

    pasoMotor(DIR_ANTIHORARIO, RETARDO_BUSQUEDA_US);
  }

  return digitalRead(SENSOR) == estadoDeseado;
}

// --------------------------------------------------
// Referenciación óptica: dos detecciones
// --------------------------------------------------
bool buscarReferencia() {
  Serial.println();
  Serial.println("BUSCANDO REFERENCIA EN SENTIDO ANTIHORARIO");

  int estadoInicial = digitalRead(SENSOR);

  Serial.print("Estado inicial: ");
  Serial.println(estadoInicial == HIGH
                 ? "HIGH - ranura bloqueada"
                 : "LOW - ranura libre");

  // Si inicia bloqueado, salir primero de la ranura.
  if (estadoInicial == RANURA_BLOQUEADA) {
    Serial.println("Saliendo de la ranura...");

    if (!buscarEstado(RANURA_LIBRE, MAX_PASOS_BUSQUEDA)) {
      Serial.println("ERROR: no se detecto ranura libre.");
      return false;
    }
  }

  // Primera detección
  Serial.println("Buscando primera deteccion...");

  if (!buscarEstado(RANURA_BLOQUEADA, MAX_PASOS_BUSQUEDA)) {
    Serial.println("ERROR: primera deteccion fallida.");
    return false;
  }

  Serial.println("Primera deteccion confirmada.");

  // Salir de la ranura
  Serial.println("Preparando segunda deteccion...");

  if (!buscarEstado(RANURA_LIBRE, MAX_PASOS_BUSQUEDA)) {
    Serial.println("ERROR: no se pudo salir de la ranura.");
    return false;
  }

  // Segunda detección de la misma marca
  Serial.println("Buscando nuevamente la referencia...");

  if (!buscarEstado(RANURA_BLOQUEADA, MAX_PASOS_BUSQUEDA)) {
    Serial.println("ERROR: segunda deteccion fallida.");
    return false;
  }

  digitalWrite(STEP_PIN, LOW);
  posicionActual = 0;

  Serial.println("REFERENCIA 0 ESTABLECIDA.");
  return true;
}

// --------------------------------------------------
// Movimiento antihorario con rampa
// --------------------------------------------------
void moverAntihorario(int cantidadPasos) {
  if (cantidadPasos <= 0) {
    return;
  }

  int rampa = min(PASOS_RAMPA, cantidadPasos / 2);

  for (int i = 0; i < cantidadPasos; i++) {
    int retardo = RETARDO_RAPIDO_US;

    // Aceleración progresiva
    if (rampa > 0 && i < rampa) {
      retardo = RETARDO_INICIO_US -
        ((RETARDO_INICIO_US - RETARDO_RAPIDO_US)
         * i / rampa);
    }

    // Desaceleración progresiva
    int restantes = cantidadPasos - 1 - i;

    if (rampa > 0 && restantes < rampa) {
      int retardoFinal = RETARDO_INICIO_US -
        ((RETARDO_INICIO_US - RETARDO_RAPIDO_US)
         * restantes / rampa);

      if (retardoFinal > retardo) {
        retardo = retardoFinal;
      }
    }

    pasoMotor(DIR_ANTIHORARIO, retardo);
  }

  digitalWrite(STEP_PIN, LOW);
}

// --------------------------------------------------
// Selección de compartimento: siempre antihorario
// --------------------------------------------------
void seleccionarCompartimento(int destino) {
  if (!referenciaEncontrada) {
    Serial.println("ERROR: referencia no encontrada.");
    return;
  }

  if (destino < 0 || destino >= NUM_POSICIONES) {
    Serial.println("Seleccion invalida. Usa 0 a 7.");
    return;
  }

    // Los números aumentan en sentido antihorario: cada número es un salto de 45 grados.
  int posicionesAntihorario =
      (destino - posicionActual + NUM_POSICIONES)
      % NUM_POSICIONES;

  if (posicionesAntihorario == 0) {
    Serial.print("Ya estas en la posicion ");
    Serial.println(destino);
    return;
  }

  int cantidadPasos =
      posicionesAntihorario * PASOS_POR_45_GRADOS;

  Serial.println();
  Serial.println("------- MOVIMIENTO -------");

  Serial.print("Posicion actual: ");
  Serial.println(posicionActual);

  Serial.print("Compartimento destino: ");
  Serial.println(destino);

  Serial.print("Avance antihorario: ");
  Serial.print(posicionesAntihorario * 45);
  Serial.println(" grados nominales");

  Serial.print("Micropasos: ");
  Serial.println(cantidadPasos);

  Serial.println("Girando en sentido antihorario...");

  moverAntihorario(cantidadPasos);

  // Actualización después de completar el movimiento.
  posicionActual = destino;

  Serial.print("Posicion estimada actualizada: ");
  Serial.println(posicionActual);

  Serial.println("Motor detenido.");
  Serial.println("Esperando nueva seleccion.");
}

// --------------------------------------------------
// Configuración inicial
// --------------------------------------------------
void setup() {
  Serial.begin(115200);

  pinMode(STEP_PIN, OUTPUT);
  pinMode(DIR_PIN, OUTPUT);

  // Conservamos el modo de entrada del sensor funcional.
  pinMode(SENSOR, INPUT);

  digitalWrite(STEP_PIN, LOW);
  delay(500);

  Serial.println("================================");
  Serial.println("DISPENSADOR - 1/8 DE MICROPASO");
  Serial.println("ESP32-S3 + NEMA17 + DRV8825");
  Serial.print("Micropasos por vuelta: ");
  Serial.println(PASOS_POR_VUELTA);
  Serial.print("Micropasos calibrados por 45 grados: ");
  Serial.println(PASOS_POR_45_GRADOS);
  Serial.println("Sentido de seleccion: ANTIHORARIO");
  Serial.println("================================");

  referenciaEncontrada = buscarReferencia();

  if (referenciaEncontrada) {
    Serial.println();
    Serial.println("SISTEMA LISTO");
    Serial.println("1 a 7: seleccionar compartimento");
    Serial.println("0: volver a la referencia");
  } else {
    Serial.println("REFERENCIACION FALLIDA.");
    Serial.println("Revisa el sensor y reinicia.");
  }
}

// --------------------------------------------------
// Selección por monitor serial
// --------------------------------------------------
void loop() {
  if (!referenciaEncontrada || !Serial.available()) {
    return;
  }

  String entrada = Serial.readStringUntil('\n');
  entrada.trim();

  if (entrada.length() == 0) {
    return;
  }

  for (unsigned int i = 0; i < entrada.length(); i++) {
    if (!isDigit(entrada[i])) {
      Serial.println("Comando invalido. Escribe un numero de 0 a 7.");
      return;
    }
  }

  int destino = entrada.toInt();
  seleccionarCompartimento(destino);
}
