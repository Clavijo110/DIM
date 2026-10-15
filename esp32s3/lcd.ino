 #include <Arduino.h>
const uint8_t PIN_RS = 47;
const uint8_t PIN_CS = 8;
const uint8_t PIN_WR = 18;
const uint8_t PIN_RST = 9;
const uint8_t PIN_RD = 17;

const uint8_t PIN_D[8] = {1, 2, 42, 41, 40, 39, 38, 48};

const uint16_t COLOR_FONDO = 0xFFFF;
const uint16_t COLOR_TEXTO = 0x0000;
const uint16_t COLOR_PANEL = 0x0010;
const uint16_t COLOR_VERDE = 0x0640;

void escribirByte(uint8_t valor) {
  for (uint8_t i = 0; i < 8; i++) {
    digitalWrite(PIN_D[i], (valor >> i) & 0x01);
  }

  digitalWrite(PIN_WR, LOW);
  digitalWrite(PIN_WR, HIGH);
}

void enviarComando(uint8_t comando) {
  digitalWrite(PIN_RS, LOW);
  escribirByte(comando);
}

void enviarDato(uint8_t valor) {
  digitalWrite(PIN_RS, HIGH);
  escribirByte(valor);
}

void enviarDatos(const uint8_t *datos, uint8_t cantidad) {
  digitalWrite(PIN_RS, HIGH);
  for (uint8_t i = 0; i < cantidad; i++) {
    escribirByte(datos[i]);
  }
}

void iniciarPantalla() {
  digitalWrite(PIN_CS, HIGH);
  digitalWrite(PIN_WR, HIGH);
  digitalWrite(PIN_RD, HIGH);

  digitalWrite(PIN_RST, LOW);
  delay(20);
  digitalWrite(PIN_RST, HIGH);
  delay(150);

  digitalWrite(PIN_CS, LOW);

  enviarComando(0x01); // Reinicio por software
  delay(150);

  const uint8_t secuenciaInicial[][6] = {
      {0xEF, 0x03, 0x80, 0x02, 0x00, 0x00},
      {0xCF, 0x00, 0xC1, 0x30, 0x00, 0x00},
      {0xED, 0x64, 0x03, 0x12, 0x81, 0x00},
      {0xE8, 0x85, 0x00, 0x78, 0x00, 0x00},
      {0xCB, 0x39, 0x2C, 0x00, 0x34, 0x02},
      {0xF7, 0x20, 0x00, 0x00, 0x00, 0x00},
      {0xEA, 0x00, 0x00, 0x00, 0x00, 0x00},
  };
  const uint8_t longitudes[] = {3, 3, 4, 3, 4, 1, 2};

  for (uint8_t i = 0; i < sizeof(longitudes); i++) {
    enviarComando(secuenciaInicial[i][0]);
    enviarDatos(&secuenciaInicial[i][1], longitudes[i]);
  }

  enviarComando(0xC0);
  enviarDato(0x23);
  enviarComando(0xC1);
  enviarDato(0x10);
  enviarComando(0xC5);
  enviarDato(0x3E);
  enviarDato(0x28);
  enviarComando(0xC7);
  enviarDato(0x86);
  enviarComando(0x36);
  enviarDato(0x28); // Orientacion horizontal y orden BGR
  enviarComando(0x3A);
  enviarDato(0x55); // Pixeles RGB565
  enviarComando(0xB1);
  enviarDato(0x00);
  enviarDato(0x18);
  enviarComando(0xB6);
  enviarDato(0x08);
  enviarDato(0x82);
  enviarDato(0x27);
  enviarComando(0xF2);
  enviarDato(0x00);
  enviarComando(0x26);
  enviarDato(0x01);

  const uint8_t gammaPositiva[] = {
      0x0F, 0x31, 0x2B, 0x0C, 0x0E, 0x08, 0x4E, 0xF1,
      0x37, 0x07, 0x10, 0x03, 0x0E, 0x09, 0x00};
  enviarComando(0xE0);
  enviarDatos(gammaPositiva, sizeof(gammaPositiva));

  const uint8_t gammaNegativa[] = {
      0x00, 0x0E, 0x14, 0x03, 0x11, 0x07, 0x31, 0xC1,
      0x48, 0x08, 0x0F, 0x0C, 0x31, 0x36, 0x0F};
  enviarComando(0xE1);
  enviarDatos(gammaNegativa, sizeof(gammaNegativa));

  enviarComando(0x11); // Salir del modo de suspension
  delay(150);
  enviarComando(0x29); // Encender pantalla
  delay(100);

  digitalWrite(PIN_CS, HIGH);
}

void establecerVentanaCompleta() {
  enviarComando(0x2A);
  enviarDato(0x00);
  enviarDato(0x00);
  enviarDato(0x01);
  enviarDato(0x3F); // 320 columnas en horizontal

  enviarComando(0x2B);
  enviarDato(0x00);
  enviarDato(0x00);
  enviarDato(0x00);
  enviarDato(0xEF); // 240 filas en horizontal

  enviarComando(0x2C);
}

void llenar(uint16_t color) {
  digitalWrite(PIN_CS, LOW);
  establecerVentanaCompleta();
  digitalWrite(PIN_RS, HIGH);

  const uint8_t alto = color >> 8;
  const uint8_t bajo = color & 0xFF;
  for (uint32_t i = 0; i < 320UL * 240UL; i++) {
    escribirByte(alto);
    escribirByte(bajo);
  }

  digitalWrite(PIN_CS, HIGH);
}

void abrirVentana(uint16_t x1, uint16_t y1, uint16_t x2, uint16_t y2) {
  digitalWrite(PIN_CS, LOW);
  enviarComando(0x2A);
  enviarDato(x1 >> 8);
  enviarDato(x1 & 0xFF);
  enviarDato(x2 >> 8);
  enviarDato(x2 & 0xFF);
  enviarComando(0x2B);
  enviarDato(y1 >> 8);
  enviarDato(y1 & 0xFF);
  enviarDato(y2 >> 8);
  enviarDato(y2 & 0xFF);
  enviarComando(0x2C);
  digitalWrite(PIN_RS, HIGH);
}

void dibujarRectangulo(int16_t x, int16_t y, int16_t ancho, int16_t alto, uint16_t color) {
  if (ancho <= 0 || alto <= 0) {
    return;
  }

  abrirVentana(x, y, x + ancho - 1, y + alto - 1);
  const uint8_t altoColor = color >> 8;
  const uint8_t bajoColor = color & 0xFF;
  const uint32_t pixeles = (uint32_t)ancho * alto;
  for (uint32_t i = 0; i < pixeles; i++) {
    escribirByte(altoColor);
    escribirByte(bajoColor);
  }
  digitalWrite(PIN_CS, HIGH);
}

const uint8_t *glifo(char caracter) {
  static const uint8_t letras[26][5] = {
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
  static const uint8_t numeros[10][5] = {
      {0x3E, 0x51, 0x49, 0x45, 0x3E}, {0x00, 0x42, 0x7F, 0x40, 0x00},
      {0x42, 0x61, 0x51, 0x49, 0x46}, {0x21, 0x41, 0x45, 0x4B, 0x31},
      {0x18, 0x14, 0x12, 0x7F, 0x10}, {0x27, 0x45, 0x45, 0x45, 0x39},
      {0x3C, 0x4A, 0x49, 0x49, 0x30}, {0x01, 0x71, 0x09, 0x05, 0x03},
      {0x36, 0x49, 0x49, 0x49, 0x36}, {0x06, 0x49, 0x49, 0x29, 0x1E}};
  static const uint8_t dosPuntos[5] = {0x00, 0x36, 0x36, 0x00, 0x00};
  static const uint8_t guion[5] = {0x08, 0x08, 0x08, 0x08, 0x08};
  static const uint8_t numeral[5] = {0x14, 0x7F, 0x14, 0x7F, 0x14};
  static const uint8_t espacio[5] = {0x00, 0x00, 0x00, 0x00, 0x00};

  if (caracter >= 'A' && caracter <= 'Z') {
    return letras[caracter - 'A'];
  }
  if (caracter >= '0' && caracter <= '9') {
    return numeros[caracter - '0'];
  }
  if (caracter == ':') {
    return dosPuntos;
  }
  if (caracter == '-') {
    return guion;
  }
  if (caracter == '#') {
    return numeral;
  }
  if (caracter == ' ') {
    return espacio;
  }
  return numeros[0];
}

void dibujarTexto(const char *texto, int16_t x, int16_t y, uint16_t escala,
                  uint16_t color, uint16_t fondo) {
  while (*texto) {
    const uint8_t *columnas = glifo(*texto++);
    const int16_t ancho = 6 * escala;
    const int16_t alto = 8 * escala;
    abrirVentana(x, y, x + ancho - 1, y + alto - 1);

    for (uint8_t fila = 0; fila < 8; fila++) {
      for (uint16_t sy = 0; sy < escala; sy++) {
        for (uint8_t columna = 0; columna < 6; columna++) {
          const bool encendido = columna < 5 && (columnas[columna] & (1 << fila));
          const uint16_t pixel = encendido ? color : fondo;
          const uint8_t altoColor = pixel >> 8;
          const uint8_t bajoColor = pixel & 0xFF;
          for (uint16_t sx = 0; sx < escala; sx++) {
            escribirByte(altoColor);
            escribirByte(bajoColor);
          }
        }
      }
    }

    digitalWrite(PIN_CS, HIGH);
    x += ancho;
  }
}

void dibujarInterfaz() {
  llenar(COLOR_FONDO);

  dibujarRectangulo(0, 0, 320, 48, COLOR_PANEL);
  dibujarRectangulo(0, 46, 320, 2, COLOR_VERDE);
  dibujarTexto("PROXIMA DOSIS", 64, 16, 2, COLOR_FONDO, COLOR_PANEL);

  dibujarRectangulo(16, 62, 288, 58, COLOR_FONDO);
  dibujarRectangulo(16, 62, 6, 58, COLOR_VERDE);
  dibujarTexto("LOSARTAN", 88, 78, 3, COLOR_TEXTO, COLOR_FONDO);

  dibujarTexto("HORA DE TOMA", 88, 133, 2, COLOR_PANEL, COLOR_FONDO);
  dibujarTexto("11:00", 55, 160, 7, COLOR_TEXTO, COLOR_FONDO);
}

void setup() {
  Serial.begin(115200);

  const uint8_t pinesControl[] = {PIN_RS, PIN_CS, PIN_WR, PIN_RST, PIN_RD};
  for (uint8_t i = 0; i < sizeof(pinesControl); i++) {
    pinMode(pinesControl[i], OUTPUT);
    digitalWrite(pinesControl[i], HIGH);
  }

  for (uint8_t i = 0; i < 8; i++) {
    pinMode(PIN_D[i], OUTPUT);
    digitalWrite(PIN_D[i], LOW);
  }

  iniciarPantalla();
  dibujarInterfaz();
  Serial.println("Interfaz visual: LOSARTAN, hora de ejemplo 08:30.");
  Serial.println("La hora es fija; no hay reloj en tiempo real ni dispensado.");
}

void loop() {
}
