/*
 * Differential test harness around the real rcheevos C library.
 *
 * stdin:
 *   line 1: trigger definition string
 *   line 2: <frame count> <ram size>
 *   next lines: one frame of RAM per line, as 2*ramsize hex chars
 *
 * stdout, per frame:
 *   <returned state> <trigger state> <measured value> <has hits> | <hit counts in parse order, groups separated by '/'>
 * or "PARSE_ERROR <code>" if the trigger fails to parse.
 */

#include "rc_internal.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

typedef struct {
  uint8_t* ram;
  uint32_t size;
} memory_t;

static uint32_t peek(uint32_t address, uint32_t num_bytes, void* ud) {
  memory_t* memory = (memory_t*)ud;
  uint32_t value = 0;
  uint32_t i;

  for (i = 0; i < num_bytes; ++i) {
    uint32_t byte = (address + i < memory->size) ? memory->ram[address + i] : 0;
    value |= byte << (i * 8);
  }

  return value;
}

static const char* state_name(int state) {
  switch (state) {
    case RC_TRIGGER_STATE_INACTIVE: return "inactive";
    case RC_TRIGGER_STATE_WAITING: return "waiting";
    case RC_TRIGGER_STATE_ACTIVE: return "active";
    case RC_TRIGGER_STATE_PAUSED: return "paused";
    case RC_TRIGGER_STATE_RESET: return "reset";
    case RC_TRIGGER_STATE_TRIGGERED: return "triggered";
    case RC_TRIGGER_STATE_PRIMED: return "primed";
    case RC_TRIGGER_STATE_DISABLED: return "disabled";
    default: return "unknown";
  }
}

static int hex_value(char ch) {
  if (ch >= '0' && ch <= '9') return ch - '0';
  if (ch >= 'a' && ch <= 'f') return ch - 'a' + 10;
  if (ch >= 'A' && ch <= 'F') return ch - 'A' + 10;
  return -1;
}

int main(void) {
  static char definition[65536];
  static char line[65536];
  static uint8_t ram[4096];
  static char buffer[1024 * 1024];
  memory_t memory;
  rc_trigger_t* trigger;
  int size, frames, ram_size, frame, i;

  if (!fgets(definition, sizeof(definition), stdin)) return 1;
  definition[strcspn(definition, "\r\n")] = '\0';

  if (scanf("%d %d\n", &frames, &ram_size) != 2) return 1;
  if (ram_size > (int)sizeof(ram)) return 1;

  size = rc_trigger_size(definition);
  if (size < 0) {
    printf("PARSE_ERROR %d\n", size);
    return 0;
  }

  trigger = rc_parse_trigger(buffer, definition, NULL, 0);
  if (!trigger) {
    printf("PARSE_ERROR 0\n");
    return 0;
  }

  memory.ram = ram;
  memory.size = ram_size;

  for (frame = 0; frame < frames; ++frame) {
    int result;
    rc_condset_t* condset;
    int first_group = 1;

    if (!fgets(line, sizeof(line), stdin)) return 1;
    for (i = 0; i < ram_size; ++i) {
      int hi = hex_value(line[i * 2]);
      int lo = hex_value(line[i * 2 + 1]);
      if (hi < 0 || lo < 0) return 1;
      ram[i] = (uint8_t)((hi << 4) | lo);
    }

    result = rc_evaluate_trigger(trigger, peek, &memory, NULL);

    printf("%s %s %u %d |", state_name(result), state_name(trigger->state),
           trigger->measured_value, (int)trigger->has_hits);

    condset = trigger->requirement;
    if (condset) {
      rc_condition_t* cond;
      printf(first_group ? " " : " / ");
      first_group = 0;
      for (cond = condset->conditions; cond; cond = cond->next)
        printf("%u,", cond->current_hits);
    }

    for (condset = trigger->alternative; condset; condset = condset->next) {
      rc_condition_t* cond;
      printf(first_group ? " " : " / ");
      first_group = 0;
      for (cond = condset->conditions; cond; cond = cond->next)
        printf("%u,", cond->current_hits);
    }

    printf("\n");
  }

  return 0;
}
