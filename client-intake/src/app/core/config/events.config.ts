/**
 * Zdarzenia w trakcie planu i reguła „kiedy przegenerować" — JEDYNE miejsce do strojenia wag i progów.
 *
 * Wynik = Σ waga typu × nasilenie (1–3) × świeżość × ciągłość, liczony od ostatniego przegenerowania:
 *  - świeżość  = 0,5 ^ (dni od zdarzenia / HALF_LIFE_DAYS),
 *  - ciągłość  = CONTINUITY_FACTOR, gdy ten sam typ wystąpił w ≥ CONTINUITY_DAYS kolejnych dniach.
 * Wynik ≥ REGEN_THRESHOLD → sugestia przegenerowania, ≥ WATCH_THRESHOLD → „obserwuj".
 * Przegenerowanie częściej niż co MIN_DAYS_BETWEEN_REGENS dni → ostrzeżenie o zbyt częstych zmianach.
 */
export type EventType = 'kontuzja' | 'choroba' | 'aktywnosc' | 'stres' | 'sen' | 'waga' | 'inne';

export interface EventTypeDef {
  label: string;
  weight: number;
  /** Podpowiedź nasilenia 1–3. */
  severity: [string, string, string];
  aliases?: string[];
}

export const EVENT_TYPES: Record<EventType, EventTypeDef> = {
  kontuzja: { label: 'Kontuzja / ból', weight: 5, severity: ['ból 1–3/10', 'ból 4–6/10', 'ból 7+/10 lub uraz'], aliases: ['bol', 'ból', 'uraz'] },
  choroba: { label: 'Choroba', weight: 4, severity: ['katar, lekko', 'gorączka / 2–4 dni bez treningu', 'antybiotyk / tydzień+'], aliases: ['chory', 'przeziebienie', 'infekcja'] },
  aktywnosc: { label: 'Inna intensywna aktywność', weight: 2, severity: ['1–2 h lekko', 'mecz / wycieczka / zawody', 'kilka dni ciężkiej pracy fizycznej'], aliases: ['aktywność', 'sport', 'mecz', 'praca'] },
  stres: { label: 'Intensywny stres', weight: 1.5, severity: ['podwyższony', 'wysoki', 'bardzo wysoki / kryzys'] },
  sen: { label: 'Niedosypianie', weight: 1, severity: ['−1 h od celu', '−2 h od celu', '−3 h lub zarwana noc'], aliases: ['niedospanie', 'sleep'] },
  waga: { label: 'Masa ciała poza planem', weight: 2, severity: ['odchylenie ~0,5% / tydz.', '~1% / tydz.', '>1,5% / tydz.'], aliases: ['masa'] },
  inne: { label: 'Inne', weight: 1, severity: ['małe', 'średnie', 'duże'] },
};

export const HALF_LIFE_DAYS = 7;
export const CONTINUITY_DAYS = 3;
export const CONTINUITY_FACTOR = 1.5;
export const WATCH_THRESHOLD = 6;
export const REGEN_THRESHOLD = 10;
export const MIN_DAYS_BETWEEN_REGENS = 14;
/** Ile przegenerowań w oknie 28 dni uznajemy za „za często". */
export const MAX_REGENS_PER_28_DAYS = 2;
