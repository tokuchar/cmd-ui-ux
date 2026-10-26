import { InjectionToken } from '@angular/core';
import { DictEntry } from '../engine/field-def';
import { FlowDef } from '../engine/step-def';
import { AthleteProfile } from '../models/athlete.model';
import { COMMANDS, CommandDef } from './commands.config';
import { DICTIONARIES } from './dictionaries.config';
import { FAKE_ALL, FAKE_ALIASES, FAKE_PRESETS, FakePreset } from './fake-data.config';
import { buildFlow } from './flow.config';

/** Cała konfiguracja aplikacji w jednym obiekcie — wstrzykiwana przez APP_CONFIG. */
export interface AppConfig<M = AthleteProfile> {
  flow: FlowDef<M>;
  dictionaries: Record<string, DictEntry[]>;
  commands: CommandDef[];
  fake: { presets: Record<string, FakePreset<M>>; aliases: Record<string, string>; all: string[] };
}

export const APP_CONFIG = new InjectionToken<AppConfig>('APP_CONFIG');

export function buildAppConfig(): AppConfig<AthleteProfile> {
  return {
    flow: buildFlow(),
    dictionaries: DICTIONARIES,
    commands: COMMANDS,
    fake: { presets: FAKE_PRESETS, aliases: FAKE_ALIASES, all: FAKE_ALL },
  };
}
