/**
 * Tryb komend intake (⌘K / Ctrl+K). `action` obsługuje IntakeEngine.runCommand().
 * Komendy widoku planu są osobno: core/plan/plan-commands.ts.
 */
export type CommandAction =
  | { type: 'summary' }
  | { type: 'validate' }
  | { type: 'fix' }
  | { type: 'restart' }
  | { type: 'prompt' }
  | { type: 'fake'; preset: string };

export interface CommandDef {
  cmd: string;
  aliases?: string[];
  desc: string;
  action: CommandAction;
}

export const COMMANDS: CommandDef[] = [
  { cmd: 'podsumowanie', aliases: ['podsum', 'podsumuj'], desc: 'Pokaż dane podstawowe (⌘J)', action: { type: 'summary' } },
  { cmd: 'prompt', aliases: ['ai', 'kopiuj prompt'], desc: 'Skopiuj prompt dla AI (profil + schemat planu)', action: { type: 'prompt' } },
  { cmd: 'waliduj', aliases: ['sprawdz', 'sprawdź'], desc: 'Sprawdź spójność profilu', action: { type: 'validate' } },
  { cmd: 'popraw', desc: 'Przejdź po polach do poprawy', action: { type: 'fix' } },
  { cmd: 'od nowa', aliases: ['restart', 'reset'], desc: 'Wyczyść profil i zacznij od początku', action: { type: 'restart' } },
  { cmd: 'fake pl', desc: 'Przykładowy trójboista (z zawodami i kontuzją)', action: { type: 'fake', preset: 'pl' } },
  { cmd: 'fake pb', desc: 'Przykładowy powerbuilder (półmaraton + handstand)', action: { type: 'fake', preset: 'pb' } },
  { cmd: 'fake all', desc: 'Pełny profil (= fake pl)', action: { type: 'fake', preset: 'all' } },
];
