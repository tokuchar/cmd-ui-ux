import { InjectionToken } from '@angular/core';
import { DictEntry } from '../engine/field-def';
import { FlowDef } from '../engine/step-def';
import { Customer } from '../models/customer.model';
import { COMMANDS, CommandDef } from './commands.config';
import { DICTIONARIES } from './dictionaries.config';
import { FAKE_ALL, FAKE_ALIASES, FAKE_PRESETS, FakePreset } from './fake-data.config';
import { buildFlow, FlowFeatures } from './flow.config';

/** Cała konfiguracja aplikacji w jednym obiekcie — wstrzykiwana przez APP_CONFIG. */
export interface AppConfig<M = Customer> {
  flow: FlowDef<M>;
  dictionaries: Record<string, DictEntry[]>;
  commands: CommandDef[];
  fake: { presets: Record<string, FakePreset<M>>; aliases: Record<string, string>; all: string[] };
  features: FlowFeatures;
}

export const APP_CONFIG = new InjectionToken<AppConfig>('APP_CONFIG');

export function buildAppConfig(features: FlowFeatures): AppConfig<Customer> {
  return {
    flow: buildFlow(features),
    dictionaries: DICTIONARIES,
    commands: COMMANDS.filter((c) => !c.demoOnly || features.demoFields),
    fake: {
      presets: FAKE_PRESETS,
      aliases: FAKE_ALIASES,
      all: features.demoFields ? [...FAKE_ALL, 'dod'] : FAKE_ALL,
    },
    features,
  };
}

/** Flagi z adresu: ?demo=1 włącza krok demonstracyjny. */
export function featuresFromUrl(search: string): FlowFeatures {
  return { demoFields: new URLSearchParams(search).has('demo') };
}
