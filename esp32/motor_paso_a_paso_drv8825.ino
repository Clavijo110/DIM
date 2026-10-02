#include <AccelStepper.h>

// ESP32 to DRV8825. Change these pins if your board wiring differs.
constexpr uint8_t STEP_PIN = 26;
constexpr uint8_t DIR_PIN = 27;
constexpr uint8_t ENABLE_PIN = 25;  // DRV8825 nENBL is active LOW.
constexpr uint8_t MODE0_PIN = 18;
constexpr uint8_t MODE1_PIN = 19;
constexpr uint8_t MODE2_PIN = 21;
constexpr uint8_t RESET_PIN = 32;
constexpr uint8_t SLEEP_PIN = 33;

// DRV8825 quarter-step mode: M0=LOW, M1=HIGH, M2=LOW.
constexpr uint16_t MOTOR_FULL_STEPS_PER_REV = 200;
constexpr uint8_t MICROSTEP_FACTOR = 4;
constexpr uint8_t COMPARTMENT_COUNT = 8;
constexpr float MAX_SPEED_MICROSTEPS_PER_SECOND = 800.0;
constexpr float ACCELERATION_MICROSTEPS_PER_SECOND_SQUARED = 800.0;
constexpr long MICROSTEPS_PER_REV = MOTOR_FULL_STEPS_PER_REV * MICROSTEP_FACTOR;
constexpr long MICROSTEPS_PER_COMPARTMENT = MICROSTEPS_PER_REV / COMPARTMENT_COUNT;

static_assert(MICROSTEPS_PER_REV % COMPARTMENT_COUNT == 0,
              "Revolution must divide evenly into compartments");

// AccelStepper uses DRIVER mode: STEP pin first, DIR pin second.
AccelStepper stepper(AccelStepper::DRIVER, STEP_PIN, DIR_PIN);
uint8_t currentSlot = 1;

void printHelp() {
  Serial.println();
  Serial.println("Commands (send with newline):");
  Serial.println("  1..8  Move forward to that compartment");
  Serial.println("  n     Advance one compartment");
  Serial.println("  r     Rotate one complete revolution");
  Serial.println("  z     Mark the current physical position as compartment 1");
  Serial.println("  ?     Show this help");
  Serial.println();
}

void moveToSlot(uint8_t targetSlot) {
  if (targetSlot < 1 || targetSlot > COMPARTMENT_COUNT) {
    Serial.println("Invalid slot. Choose 1 through 8.");
    return;
  }

  const uint8_t currentIndex = currentSlot - 1;
  const uint8_t targetIndex = targetSlot - 1;
  const uint8_t forwardSlots = (targetIndex + COMPARTMENT_COUNT - currentIndex) % COMPARTMENT_COUNT;
  const long stepDistance = static_cast<long>(forwardSlots) * MICROSTEPS_PER_COMPARTMENT;

  if (stepDistance == 0) {
    Serial.printf("Already at compartment %u.\n", currentSlot);
    return;
  }

  stepper.move(stepDistance);
  stepper.runToPosition();
  currentSlot = targetSlot;

  Serial.printf("At compartment %u (%ld microsteps from the previous position).\n",
                currentSlot, stepDistance);
}

void rotateOneRevolution() {
  stepper.move(MICROSTEPS_PER_REV);
  stepper.runToPosition();
  Serial.println("One revolution complete; compartment alignment is unchanged.");
}

void setCurrentPositionAsSlotOne() {
  stepper.setCurrentPosition(0);
  currentSlot = 1;
  Serial.println("Current physical position marked as compartment 1 (manual reference; no sensor used).");
}

void setup() {
  Serial.begin(115200);

  pinMode(MODE0_PIN, OUTPUT);
  pinMode(MODE1_PIN, OUTPUT);
  pinMode(MODE2_PIN, OUTPUT);
  pinMode(RESET_PIN, OUTPUT);
  pinMode(SLEEP_PIN, OUTPUT);
  digitalWrite(MODE0_PIN, LOW);
  digitalWrite(MODE1_PIN, HIGH);
  digitalWrite(MODE2_PIN, LOW);
  digitalWrite(RESET_PIN, HIGH);
  digitalWrite(SLEEP_PIN, HIGH);
  delay(2);  // Allow the DRV8825 charge pump to wake before enabling outputs.

  stepper.setEnablePin(ENABLE_PIN);
  stepper.setPinsInverted(false, false, true);
  stepper.setMaxSpeed(MAX_SPEED_MICROSTEPS_PER_SECOND);
  stepper.setAcceleration(ACCELERATION_MICROSTEPS_PER_SECOND_SQUARED);
  stepper.setCurrentPosition(0);
  stepper.enableOutputs();

  Serial.println("DRV8825 quarter-step test ready.");
  Serial.printf("%ld microsteps/rev, %ld microsteps/compartment (45 degrees).\n",
                MICROSTEPS_PER_REV, MICROSTEPS_PER_COMPARTMENT);
  Serial.println("No end stop is used in this test.");
  Serial.println("At startup, the current motor position is assumed to be compartment 1.");
  Serial.println("Manual motor test only; this sketch does not schedule or authorize medication dispensing.");
  printHelp();
}

void loop() {
  if (!Serial.available()) return;

  const char command = static_cast<char>(Serial.read());
  if (command >= '1' && command <= '8') {
    moveToSlot(command - '0');
  } else if (command == 'n' || command == 'N') {
    moveToSlot(currentSlot % COMPARTMENT_COUNT + 1);
  } else if (command == 'r' || command == 'R') {
    rotateOneRevolution();
  } else if (command == 'z' || command == 'Z') {
    setCurrentPositionAsSlotOne();
  } else if (command == '?') {
    printHelp();
  }
}
