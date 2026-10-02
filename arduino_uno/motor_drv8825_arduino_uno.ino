#include <AccelStepper.h>

// Arduino Uno -> DRV8825. Keep USB Serial free for the command monitor.
constexpr uint8_t STEP_PIN = 2;
constexpr uint8_t DIR_PIN = 3;
constexpr uint8_t ENABLE_PIN = 4;  // DRV8825 nENBL is active LOW.
constexpr uint8_t MODE0_PIN = 5;
constexpr uint8_t MODE1_PIN = 6;
constexpr uint8_t MODE2_PIN = 7;
constexpr uint8_t RESET_PIN = 8;
constexpr uint8_t SLEEP_PIN = 9;

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

AccelStepper stepper(AccelStepper::DRIVER, STEP_PIN, DIR_PIN);
uint8_t currentSlot = 1;

void printHelp() {
  Serial.println();
  Serial.println("Send a command followed by newline:");
  Serial.println("  1..8  Move forward to that compartment");
  Serial.println("  n     Advance one compartment (45 degrees)");
  Serial.println("  r     Rotate one complete revolution");
  Serial.println("  z     Mark current physical position as compartment 1");
  Serial.println("  ?     Show this help");
}

void moveToSlot(uint8_t targetSlot) {
  if (targetSlot < 1 || targetSlot > COMPARTMENT_COUNT) {
    Serial.println("Invalid compartment. Use 1 through 8.");
    return;
  }

  const uint8_t currentIndex = currentSlot - 1;
  const uint8_t targetIndex = targetSlot - 1;
  const uint8_t forwardSlots = (targetIndex + COMPARTMENT_COUNT - currentIndex) % COMPARTMENT_COUNT;
  const long stepDistance = static_cast<long>(forwardSlots) * MICROSTEPS_PER_COMPARTMENT;

  if (stepDistance == 0) {
    Serial.print("Already at compartment ");
    Serial.println(currentSlot);
    return;
  }

  stepper.move(stepDistance);
  stepper.runToPosition();
  currentSlot = targetSlot;

  Serial.print("Reached compartment ");
  Serial.print(currentSlot);
  Serial.print("; moved ");
  Serial.print(stepDistance);
  Serial.println(" microsteps.");
}

void rotateOneRevolution() {
  stepper.move(MICROSTEPS_PER_REV);
  stepper.runToPosition();
  Serial.println("One revolution complete.");
}

void setCurrentPositionAsSlotOne() {
  stepper.setCurrentPosition(0);
  currentSlot = 1;
  Serial.println("Current physical position marked as compartment 1.");
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
  delay(2);  // DRV8825 wake-up time before enabling the driver.

  stepper.setEnablePin(ENABLE_PIN);
  stepper.setPinsInverted(false, false, true);
  stepper.setMaxSpeed(MAX_SPEED_MICROSTEPS_PER_SECOND);
  stepper.setAcceleration(ACCELERATION_MICROSTEPS_PER_SECOND_SQUARED);
  stepper.setCurrentPosition(0);
  stepper.enableOutputs();

  Serial.println("Arduino Uno + DRV8825 quarter-step test ready.");
  Serial.print(MICROSTEPS_PER_REV);
  Serial.print(" microsteps/rev; ");
  Serial.print(MICROSTEPS_PER_COMPARTMENT);
  Serial.println(" microsteps/compartment (45 degrees).");
  Serial.println("At startup, the current position is assumed to be compartment 1.");
  Serial.println("Manual motor test only; no sensor or automatic dispensing is used.");
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
