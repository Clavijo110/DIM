#pragma once

#include <Arduino.h>
#include <Preferences.h>
#include "DeviceConfig.h"
#include "DispenseService.h"
#include "PillSize.h"

struct MedicationScheduleInput {
  uint8_t compartment;
  char medicationName[25];
  PillSize pillSize;
  uint8_t startHour;
  uint8_t startMinute;
  uint8_t frequencyHours;
  uint8_t pillsPerDose;
  uint8_t amount;
};

struct MedicationScheduleState {
  bool enabled;
  bool faulted;
  bool inProgress;
  char medicationName[25];
  PillSize pillSize;
  uint8_t startHour;
  uint8_t startMinute;
  uint8_t frequencyHours;
  uint8_t pillsPerDose;
  uint8_t amount;
  uint32_t nextDue;
};

struct OneTimeScheduleState {
  bool enabled;
  bool faulted;
  bool inProgress;
  uint8_t compartment;
  uint32_t nextDue;
};

class ScheduleService {
 public:
  bool begin();
  bool replace(const MedicationScheduleInput* schedules, uint8_t count, uint32_t localNow);
  bool rebase(uint32_t localNow);
  bool clockAligned() const;
  bool scheduleOnce(uint8_t compartment, uint32_t dueAt, uint32_t localNow);
  bool cancelOneTime();
  bool beginDispense(uint8_t compartment, uint8_t pillsPerDose, PillSize pillSize);
  bool completeDispense(uint8_t compartment, uint8_t pillsDispensed, uint32_t localNow, bool scheduled);
  void failDispense(uint8_t compartment);
  void poll(uint32_t localNow, bool clockValid, DispenseService& dispenser);
  const MedicationScheduleState& state(uint8_t compartment) const;
  const OneTimeScheduleState& oneTime() const;
  const MedicationScheduleState* nextDue() const;
  uint8_t enabledCount() const;

 private:
  bool persist();
  bool persistOneTime();
  uint32_t firstDue(uint32_t localNow, uint8_t hour, uint8_t minute,
      uint8_t frequencyHours) const;

  Preferences preferences_;
  MedicationScheduleState states_[7]{};
  OneTimeScheduleState oneTime_{};
  bool storageReady_ = false;
  bool clockAligned_ = true;
};
