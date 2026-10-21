#include "FeederService.h"
#include "DeviceConfig.h"

namespace {
constexpr uint8_t SEQUENCE[8][4] = {
    {1, 0, 0, 0}, {1, 1, 0, 0}, {0, 1, 0, 0}, {0, 1, 1, 0},
    {0, 0, 1, 0}, {0, 0, 1, 1}, {0, 0, 0, 1}, {1, 0, 0, 1}};
constexpr uint32_t MAX_HOME_STEPS = 12000;
constexpr uint8_t HOME_CONFIRMATIONS = 3;
constexpr uint16_t STEP_DELAY_MS = 3;
}

void FeederService::begin() {
  pinMode(DeviceConfig::FEEDER_IN1_PIN, OUTPUT);
  pinMode(DeviceConfig::FEEDER_IN2_PIN, OUTPUT);
  pinMode(DeviceConfig::FEEDER_IN3_PIN, OUTPUT);
  pinMode(DeviceConfig::FEEDER_IN4_PIN, OUTPUT);
  releaseMotor();
}

void FeederService::writePhase() {
  digitalWrite(DeviceConfig::FEEDER_IN1_PIN, SEQUENCE[phase_][0]);
  digitalWrite(DeviceConfig::FEEDER_IN2_PIN, SEQUENCE[phase_][1]);
  digitalWrite(DeviceConfig::FEEDER_IN3_PIN, SEQUENCE[phase_][2]);
  digitalWrite(DeviceConfig::FEEDER_IN4_PIN, SEQUENCE[phase_][3]);
}

void FeederService::releaseMotor() {
  digitalWrite(DeviceConfig::FEEDER_IN1_PIN, LOW);
  digitalWrite(DeviceConfig::FEEDER_IN2_PIN, LOW);
  digitalWrite(DeviceConfig::FEEDER_IN3_PIN, LOW);
  digitalWrite(DeviceConfig::FEEDER_IN4_PIN, LOW);
}

void FeederService::stepForward() {
  phase_ = (phase_ + 1) % 8;
  writePhase();
  delay(STEP_DELAY_MS);
  ++positionSteps_;
}

void FeederService::stepBackward() {
  phase_ = (phase_ + 7) % 8;
  writePhase();
  delay(STEP_DELAY_MS);
  --positionSteps_;
}

bool FeederService::stableHome() const {
  bool stable = true;
  for (uint8_t sample = 0; sample < HOME_CONFIRMATIONS; ++sample) {
    const bool current = digitalRead(DeviceConfig::FEEDER_HOME_PIN) == DeviceConfig::FEEDER_HOME_LEVEL;
    stable = stable && current;
    delay(2);
  }
  return stable;
}

bool FeederService::home() {
  pinMode(DeviceConfig::FEEDER_HOME_PIN, INPUT);
  // Si arranca sobre la marca, se separa hacia atrás para entrar siempre
  // hacia adelante por el mismo flanco.
  if (stableHome()) {
    for (uint16_t step = 0; step < DeviceConfig::FEEDER_STEPS_PER_QUARTER_TURN && stableHome(); ++step) {
      stepBackward();
    }
    for (uint8_t step = 0; step < DeviceConfig::FEEDER_BACKLASH_STEPS; ++step) stepBackward();
  }
  bool found = false;
  for (uint32_t step = 0; !found && step < MAX_HOME_STEPS; ++step) {
    stepForward();
    found = stableHome();
  }
  if (!found) {
    homed_ = false;
    releaseMotor();
    return false;
  }
  positionSteps_ = 0;
  homed_ = true;
  // El disco nunca queda abierto: tras detectar la marca pasa a cerrado.
  return moveToClosed();
}

bool FeederService::moveToStepPosition(long targetSteps) {
  if (!homed_) return false;
  const long revolution = DeviceConfig::FEEDER_STEPS_PER_REVOLUTION;
  long currentSteps = positionSteps_ % revolution;
  if (currentSteps < 0) currentSteps += revolution;
  const long forwardSteps = (targetSteps - currentSteps + revolution) % revolution;
  const long backwardSteps = (currentSteps - targetSteps + revolution) % revolution;
  if (forwardSteps <= backwardSteps) {
    for (long step = 0; step < forwardSteps; ++step) stepForward();
  } else {
    // Se pasa un poco hacia atrás y entra hacia adelante para absorber el juego.
    for (long step = 0; step < backwardSteps + DeviceConfig::FEEDER_BACKLASH_STEPS; ++step) stepBackward();
    for (uint8_t step = 0; step < DeviceConfig::FEEDER_BACKLASH_STEPS; ++step) stepForward();
  }
  positionSteps_ = targetSteps;
  releaseMotor();
  return true;
}

bool FeederService::moveToSize(PillSize size) {
  long targetPosition = 0;
  switch (size) {
    case PillSize::Large:
      targetPosition = DeviceConfig::FEEDER_LARGE_POSITION;
      break;
    case PillSize::Small:
      targetPosition = DeviceConfig::FEEDER_SMALL_POSITION;
      break;
    case PillSize::Medium:
      targetPosition = DeviceConfig::FEEDER_MEDIUM_POSITION;
      break;
    default:
      return false;
  }
  return moveToStepPosition(targetPosition * DeviceConfig::FEEDER_STEPS_PER_QUARTER_TURN);
}

bool FeederService::rotateHalfTurn() {
  if (!homed_) return false;
  for (uint16_t step = 0; step < DeviceConfig::FEEDER_STEPS_PER_REVOLUTION / 2; ++step) {
    stepForward();
  }
  releaseMotor();
  return true;
}

bool FeederService::moveToClosed() {
  return moveToStepPosition(
      static_cast<long>(DeviceConfig::FEEDER_CLOSED_POSITION) * DeviceConfig::FEEDER_STEPS_PER_QUARTER_TURN);
}

bool FeederService::runPositionCycle(PillSize size) {
  if (!homed_ || !moveToSize(size)) return false;
  delay(2000);
  return rotateHalfTurn() && moveToClosed();
}

long FeederService::positionSteps() const { return positionSteps_; }
bool FeederService::homed() const { return homed_; }