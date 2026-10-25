/**
 * Tryb komend (⌘K / Ctrl+K). `action` obsługuje IntakeEngine.runCommand().
 * Mockup: podsumowanie + fake …; dodane: waliduj, popraw, od nowa.
 */
export type CommandAction =
  | { type: 'summary' }
  | { type: 'validate' }
  | { type: 'fix' }
  | { type: 'restart' }
  | { type: 'fake'; preset: string };

export interface CommandDef {
  cmd: string;
  aliases?: string[];
  desc: string;
  action: CommandAction;
  /** Widoczna tylko z włączonym demo. */
  demoOnly?: boolean;
}

export const COMMANDS: CommandDef[] = [
  { cmd: 'podsumowanie', aliases: ['podsum', 'podsumuj'], desc: 'Pokaż podsumowanie (Dane klienta)', action: { type: 'summary' } },
  { cmd: 'waliduj', aliases: ['walidacja', 'sprawdz', 'sprawdź'], desc: 'Zweryfikuj kartę w usłudze walidacji', action: { type: 'validate' } },
  { cmd: 'popraw', desc: 'Przejdź po polach do poprawy', action: { type: 'fix' } },
  { cmd: 'od nowa', aliases: ['restart', 'reset'], desc: 'Wyczyść kartę i zacznij od początku', action: { type: 'restart' } },
  { cmd: 'fake ctct', desc: 'Kontakt: imię, nazwisko, telefon', action: { type: 'fake', preset: 'ctct' } },
  { cmd: 'fake mail', desc: 'Adres e-mail', action: { type: 'fake', preset: 'mail' } },
  { cmd: 'fake adr', desc: 'Adres klienta i wysyłki', action: { type: 'fake', preset: 'adr' } },
  { cmd: 'fake dod', desc: 'Dane dodatkowe (demo)', action: { type: 'fake', preset: 'dod' }, demoOnly: true },
  { cmd: 'fake all', desc: 'Wszystkie sekcje', action: { type: 'fake', preset: 'all' } },
];
