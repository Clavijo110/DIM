#include "ScheduleService.h"
#include <RTClib.h>
#include <cstring>

namespace {
constexpr uint32_t MAX_SCHEDULE_LATENESS_SECONDS = 300;
constexpr uint32_t SECONDS_PER_HOUR = 3600;

struct StoredScheduleState {
  uint32_t nextDue;
  char medicationName[25];
  uint8_t enabled;
  uint8_t faulted;
  uint8_t inProgress;
  uint8_t pillSize;
  uint8_t startHour;
  uint8_t startMinute;
  uint8_t frequencyHours;
  uint8_t pillsPerDose;
  uint8_t amount;
};

struct StoredOneTimeSchedule {
  uint32_t nextDue;
  uint8_t enabled;
  uint8_t faulted;
  uint8_t inProgress;
  uint8_t compartment;
};

}

bool ScheduleService::begin() {
  storageReady_ = preferences_.begin("dim-dose", false);
  if (!storageReady_) return false;

  const size_t stateSize = preferences_.getBytesLength("state");
  if (stateSize == sizeof(StoredScheduleState) * 7) {
    StoredScheduleState stored[7]{};
    if (preferences_.getBytes("state", stored, sizeof(stored)) != sizeof(stored)) return false;
    bool recoveredInterruptedCycle = false;
    for (uint8_t index = 0; index < 7; ++index) {
      MedicationScheduleState& state = states_[index];
      state.enabled = stored[index].enabled != 0;
      state.faulted = stored[index].faulted != 0 || stored[index].inProgress != 0;
      state.inProgress = stored[index].inProgress != 0;
      memcpy(state.medicationName, stored[index].medicationName, sizeof(state.medicationName));
      state.medicationName[sizeof(state.medicationName) - 1] = '\0';
      state.pillSize = static_cast<PillSize>(stored[index].pillSize);
      if (stored[index].pillSize > static_cast<uint8_t>(PillSize::Medium)) {
        state.enabled = false;
        state.faulted = true;
      }
      state.startHour = stored[index].startHour;
      state.startMinute = stored[index].startMinute;
      state.frequencyHours = stored[index].frequencyHours;
      state.pillsPerDose = stored[index].pillsPerDose;
      state.amount = stored[index].amount;
      state.nextDue = stored[index].nextDue;
      recoveredInterruptedCycle = recoveredInterruptedCycle || stored[index].inProgress != 0;
    }
    if (recoveredInterruptedCycle && !persist()) return false;
  } else if (stateSize > 0) {
    preferences_.remove("state");
  }
  const size_t oneTimeSize = preferences_.getBytesLength("once");
  if (oneTimeSize == sizeof(StoredOneTimeSchedule)) {
    StoredOneTimeSchedule stored{};
    if (preferences_.getBytes("once", &stored, sizeof(stored)) != sizeof(stored)) return false;
    oneTime_.enabled = stored.enabled != 0;
    oneTime_.faulted = stored.faulted != 0 || stored.inProgress != 0;
    oneTime_.inProgress = false;
    oneTime_.compartment = stored.compartment;
    oneTime_.nextDue = stored.nextDue;
    if (oneTime_.compartment < 1 || oneTime_.compartment > 7) {
      oneTime_ = {};
      preferences_.remove("once");
    } else if (stored.inProgress != 0 && !persistOneTime()) {
      return false;
    }
  } else if (oneTimeSize > 0) {
    preferences_.remove("once");
  }
  return true;
}

bool ScheduleService::replace(const MedicationScheduleInput* schedules, uint8_t count, uint32_t localNow) {
  if (!storageReady_ || count > 7 || (count > 0 && schedules == nullptr)) return false;
  MedicationScheduleState replacement[7]{};
  bool seen[7]{};

  for (uint8_t index = 0; index < count; ++index) {
    const MedicationScheduleInput& input = schedules[index];
    if (input.compartment < 1 || input.compartment > 7 || seen[input.compartment - 1]
        || input.pillSize > PillSize::Medium
        || input.medicationName[0] == '\0'
        || strnlen(input.medicationName, sizeof(input.medicationName)) >= sizeof(input.medicationName)
        || input.startHour > 23 || input.startMinute > 59
        || input.frequencyHours < 1 || input.frequencyHours > 168
        || input.pillsPerDose < 1 || input.pillsPerDose > 60
        || input.amount < input.pillsPerDose || input.amount > 60) {
      return false;
    }
    seen[input.compartment - 1] = true;
    const MedicationScheduleState& existing = states_[input.compartment - 1];
    const bool planUnchanged = existing.enabled && !existing.faulted && !existing.inProgress
        && existing.pillSize == input.pillSize
        && strcmp(existing.medicationName, input.medicationName) == 0
        && existing.startHour == input.startHour
        && existing.startMinute == input.startMinute
        && existing.frequencyHours == input.frequencyHours
        && existing.pillsPerDose == input.pillsPerDose
        && existing.amount == input.amount;
    MedicationScheduleState& next = replacement[input.compartment - 1];
    next.enabled = true;
    next.faulted = false;
    next.inProgress = false;
    memcpy(next.medicationName, input.medicationName, sizeof(next.medicationName));
    next.pillSize = input.pillSize;
    next.startHour = input.startHour;
    next.startMinute = input.startMinute;
    next.frequencyHours = input.frequencyHours;
    next.pillsPerDose = input.pillsPerDose;
    next.amount = input.amount;
    next.nextDue = planUnchanged ? existing.nextDue
        : firstDue(localNow, input.startHour, input.startMinute, input.frequencyHours);
  }

  MedicationScheduleState previous[7];
  memcpy(previous, states_, sizeof(states_));
  memcpy(states_, replacement, sizeof(states_));
  if (persist()) {
    clockAligned_ = true;
    return true;
  }
  memcpy(states_, previous, sizeof(states_));
  return false;
}

bool ScheduleService::rebase(uint32_t localNow) {
  if (!storageReady_) return false;
  clockAligned_ = false;
  MedicationScheduleState previous[7];
  memcpy(previous, states_, sizeof(states_));
  for (MedicationScheduleState& entry : states_) {
    if (entry.enabled) {
      entry.nextDue = firstDue(
          localNow, entry.startHour, entry.startMinute, entry.frequencyHours);
    }
  }
  if (persist()) {
    clockAligned_ = true;
    return true;
  }
  memcpy(states_, previous, sizeof(states_));
  return false;
}

bool ScheduleService::clockAligned() const {
  return clockAligned_;
}

bool ScheduleService::scheduleOnce(uint8_t compartment, uint32_t dueAt, uint32_t localNow) {
  if (!storageReady_ || !clockAligned_ || compartment < 1 || compartment > 7 || dueAt <= localNow
      || oneTime_.enabled || !states_[compartment - 1].enabled
      || states_[compartment - 1].faulted || states_[compartment - 1].inProgress
      || states_[compartment - 1].amount < states_[compartment - 1].pillsPerDose) {
    return false;
  }
  oneTime_ = {true, false, false, compartment, dueAt};
  if (persistOneTime()) return true;
  oneTime_ = {};
  return false;
}

bool ScheduleService::cancelOneTime() {
  if (!storageReady_ || oneTime_.inProgress) return false;
  const OneTimeScheduleState previous = oneTime_;
  oneTime_ = {};
  if (persistOneTime()) return true;
  oneTime_ = previous;
  return false;
}

bool ScheduleService::beginDispense(uint8_t compartment, uint8_t pillsPerDose, PillSize pillSize) {
  if (compartment < 1 || compartment > 7) return false;
  MedicationScheduleState& entry = states_[compartment - 1];
  if (!entry.enabled) return true;
  if (entry.faulted || entry.inProgress || pillsPerDose != entry.pillsPerDose
      || pillSize != entry.pillSize
      || entry.amount < pillsPerDose) return false;

  entry.inProgress = true;
  if (persist()) return true;
  entry.faulted = true;
  return false;
}

bool ScheduleService::completeDispense(uint8_t compartment, uint8_t pillsDispensed, uint32_t localNow, bool scheduled) {
  if (compartment < 1 || compartment > 7) return false;
  MedicationScheduleState& entry = states_[compartment - 1];
  if (!entry.enabled) return true;
  if (!entry.inProgress || pillsDispensed != entry.pillsPerDose || entry.amount < pillsDispensed) return false;

  entry.amount -= pillsDispensed;
  if (scheduled) {
    const uint32_t interval = static_cast<uint32_t>(entry.frequencyHours) * SECONDS_PER_HOUR;
    do {
      entry.nextDue += interval;
    } while (entry.nextDue <= localNow);
  }
  entry.inProgress = false;
  if (persist()) return true;
  entry.faulted = true;
  entry.inProgress = true;
  return false;
}

void ScheduleService::failDispense(uint8_t compartment) {
  if (compartment < 1 || compartment > 7) return;
  MedicationScheduleState& entry = states_[compartment - 1];
  if (!entry.enabled) return;
  entry.faulted = true;
  entry.inProgress = true;
  persist();
}

void ScheduleService::poll(uint32_t localNow, bool clockValid, DispenseService& dispenser) {
  if (!clockValid || !clockAligned_) return;
  if (oneTime_.enabled && !oneTime_.faulted && localNow >= oneTime_.nextDue) {
    if (localNow - oneTime_.nextDue > MAX_SCHEDULE_LATENESS_SECONDS) {
      oneTime_.faulted = true;
      persistOneTime();
      return;
    }
    MedicationScheduleState& entry = states_[oneTime_.compartment - 1];
    if (!entry.enabled || entry.faulted || entry.inProgress
        || entry.amount < entry.pillsPerDose
        || !beginDispense(oneTime_.compartment, entry.pillsPerDose, entry.pillSize)) {
      oneTime_.faulted = true;
      persistOneTime();
      return;
    }
    oneTime_.inProgress = true;
    if (!persistOneTime()) {
      failDispense(oneTime_.compartment);
      oneTime_.faulted = true;
      return;
    }
    uint8_t pillsDetected = 0;
    const uint32_t recurringDistance = entry.nextDue > oneTime_.nextDue
        ? entry.nextDue - oneTime_.nextDue
        : oneTime_.nextDue - entry.nextDue;
    const bool replacesRecurringOccurrence = recurringDistance <= MAX_SCHEDULE_LATENESS_SECONDS;
    const DispenseError result = dispenser.run(
        oneTime_.compartment, entry.pillSize, entry.pillsPerDose, pillsDetected);
    if (result != DispenseError::None || pillsDetected != entry.pillsPerDose
        || !completeDispense(oneTime_.compartment, entry.pillsPerDose, localNow, false)) {
      failDispense(oneTime_.compartment);
      oneTime_.faulted = true;
      oneTime_.inProgress = false;
      persistOneTime();
      return;
    }
    if (replacesRecurringOccurrence) {
      entry.nextDue += static_cast<uint32_t>(entry.frequencyHours) * SECONDS_PER_HOUR;
      while (entry.nextDue <= localNow) {
        entry.nextDue += static_cast<uint32_t>(entry.frequencyHours) * SECONDS_PER_HOUR;
      }
      if (!persist()) entry.faulted = true;
    }
    oneTime_ = {};
    persistOneTime();
    return;
  }
  for (uint8_t index = 0; index < 7; ++index) {
    MedicationScheduleState& entry = states_[index];
    if (!entry.enabled || entry.faulted || entry.inProgress || localNow < entry.nextDue) continue;

    if (localNow - entry.nextDue > MAX_SCHEDULE_LATENESS_SECONDS) {
      do {
        entry.nextDue += static_cast<uint32_t>(entry.frequencyHours) * SECONDS_PER_HOUR;
      } while (entry.nextDue <= localNow);
      if (!persist()) entry.faulted = true;
      continue;
    }
    if (entry.amount < entry.pillsPerDose || !beginDispense(index + 1, entry.pillsPerDose, entry.pillSize)) {
      entry.faulted = true;
      persist();
      continue;
    }

    uint8_t pillsDetected = 0;
    const DispenseError result = dispenser.run(
        index + 1, entry.pillSize, entry.pillsPerDose, pillsDetected);
    if (result != DispenseError::None || pillsDetected != entry.pillsPerDose) {
      failDispense(index + 1);
      continue;
    }
    if (!completeDispense(index + 1, entry.pillsPerDose, localNow, true)) {
      entry.faulted = true;
      persist();
    }
  }

}

const MedicationScheduleState* ScheduleService::nextDue() const {
  const MedicationScheduleState* next = nullptr;
  for (const MedicationScheduleState& entry : states_) {
    if (!entry.enabled || entry.faulted || entry.inProgress) continue;
    if (next == nullptr || entry.nextDue < next->nextDue) next = &entry;
  }
  return next;
}

const MedicationScheduleState& ScheduleService::state(uint8_t compartment) const {
  static const MedicationScheduleState empty{};
  if (compartment < 1 || compartment > 7) return empty;
  return states_[compartment - 1];
}

const OneTimeScheduleState& ScheduleService::oneTime() const {
  return oneTime_;
}

uint8_t ScheduleService::enabledCount() const {
  uint8_t count = 0;
  for (const MedicationScheduleState& entry : states_) {
    if (entry.enabled) ++count;
  }
  return count;
}

bool ScheduleService::persist() {
  if (!storageReady_) return false;
  StoredScheduleState stored[7]{};
  for (uint8_t index = 0; index < 7; ++index) {
    const MedicationScheduleState& entry = states_[index];
    stored[index] = {
        entry.nextDue,
        {},
        static_cast<uint8_t>(entry.enabled),
        static_cast<uint8_t>(entry.faulted),
        static_cast<uint8_t>(entry.inProgress),
        static_cast<uint8_t>(entry.pillSize),
        entry.startHour,
        entry.startMinute,
        entry.frequencyHours,
        entry.pillsPerDose,
        entry.amount};
    memcpy(stored[index].medicationName, entry.medicationName,
        sizeof(stored[index].medicationName));
  }
  return preferences_.putBytes("state", stored, sizeof(stored)) == sizeof(stored);
}

bool ScheduleService::persistOneTime() {
  if (!storageReady_) return false;
  const StoredOneTimeSchedule stored{
      oneTime_.nextDue,
      static_cast<uint8_t>(oneTime_.enabled),
      static_cast<uint8_t>(oneTime_.faulted),
      static_cast<uint8_t>(oneTime_.inProgress),
      oneTime_.compartment};
  return preferences_.putBytes("once", &stored, sizeof(stored)) == sizeof(stored);
}

uint32_t ScheduleService::firstDue(uint32_t localNow, uint8_t hour, uint8_t minute,
    uint8_t frequencyHours) const {
  const DateTime now(localNow);
  const DateTime start(now.year(), now.month(), now.day(), hour, minute, 0);
  const uint32_t startAt = start.unixtime();
  const uint32_t interval = static_cast<uint32_t>(frequencyHours) * SECONDS_PER_HOUR;
  if (startAt > localNow) return startAt;
  return startAt + ((localNow - startAt) / interval + 1) * interval;
}
