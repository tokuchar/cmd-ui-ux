/**
 * Komendy widoku planu (⌘K w zakładce Plan). Rejestr = podpowiedzi w command line + pomoc.
 * Wykonanie: PlanEngine.run(). Argumenty w `args` to szary ghost-text po nazwie komendy.
 */
export interface PlanCommandDef {
  cmd: string;
  aliases?: string[];
  args?: string;
  desc: string;
  group: 'nawigacja' | 'info' | 'trening' | 'modyfikacja' | 'zdarzenia' | 'ai';
}

export const PLAN_COMMANDS: PlanCommandDef[] = [
  { cmd: 'nastepny', aliases: ['next', 'następny', 'kolejny'], desc: 'Kolejny niewykonany trening', group: 'nawigacja' },
  { cmd: 'dzis', aliases: ['today', 'dziś'], desc: 'Co dziś: sesja albo dzień wolny', group: 'nawigacja' },
  { cmd: 'tydzien', aliases: ['week', 'tydzień', 'w'], args: '[nr]', desc: 'Mikrocykl (domyślnie bieżący)', group: 'nawigacja' },
  { cmd: 'makro', aliases: ['macro', 'makrocykl'], args: '[2600 180 300 70]', desc: 'Makrocykl · z liczbami: zaloguj makro dnia (kcal, B, W, T)', group: 'nawigacja' },
  { cmd: 'mezo', aliases: ['meso', 'mezocykl'], args: '[nazwa]', desc: 'Podświetl gałąź mezocyklu', group: 'nawigacja' },
  { cmd: 'idz', aliases: ['goto', 'idź'], args: 'W8', desc: 'Przesuń zaznaczenie na tydzień', group: 'nawigacja' },
  { cmd: 'dieta', aliases: ['diet', 'kalorie', 'makra'], desc: 'Kcal i makro: dzień treningowy / wolny, high-carb', group: 'info' },
  { cmd: 'kofeina', aliases: ['kawa', 'caffeine'], desc: 'Kofeina: dawka przed treningiem, limit, godzina graniczna', group: 'info' },
  { cmd: 'porady', aliases: ['tipy', 'tips', 'zywienie', 'żywienie'], args: '[zdrowie|faza|…]', desc: 'Porady żywieniowe (faza, zdrowie, okołotreningowo)', group: 'info' },
  { cmd: 'sen', aliases: ['regeneracja', 'sleep'], args: '[6.5 7]', desc: 'Cel snu · z liczbami: zaloguj sen (h, jakość)', group: 'info' },
  { cmd: 'cardio', args: '[40 z2 142]', desc: 'Cardio tygodnia w strefach · z liczbami: zaloguj (min, strefa, tętno)', group: 'info' },
  { cmd: 'prehab', aliases: ['rozgrzewka', 'rehab', 'warmup'], desc: 'Rozgrzewka i prehab z sesji', group: 'info' },
  { cmd: 'deload', desc: 'Kiedy następny deload', group: 'info' },
  { cmd: 'cele', aliases: ['goals'], desc: 'Cele dodatkowe i kamienie milowe', group: 'info' },
  { cmd: 'sugeruj ciezary', aliases: ['sugeruj', 'ciezary', 'ciężary', 'kg'], args: '[bój]', desc: 'Serie sesji (kg · powt. · tempo · RIR) albo tabela RTS boju', group: 'trening' },
  { cmd: 'zaloguj', aliases: ['log'], args: 'squat 180x3@8', desc: 'Zapisz serię → nowe e1RM', group: 'trening' },
  { cmd: 'zrobione', aliases: ['done', 'zrobiony'], desc: 'Oznacz otwartą sesję jako wykonaną', group: 'trening' },
  { cmd: 'pomin', aliases: ['skip', 'pomiń'], desc: 'Oznacz otwartą sesję jako pominiętą', group: 'trening' },
  { cmd: 'zamien', aliases: ['zamień', 'swap'], args: 'przysiad na przysiad z pauzą', desc: 'Podmień ćwiczenie w sesji', group: 'modyfikacja' },
  { cmd: 'modyfikuj', aliases: ['edytuj', 'edit'], desc: 'Edycja serii w sesji krok po kroku', group: 'modyfikacja' },
  { cmd: 'przesun', aliases: ['przesuń', 'move'], args: 'pt so', desc: 'Przenieś sesję na inny dzień', group: 'modyfikacja' },
  { cmd: 'krocej', aliases: ['krócej', 'short'], args: '45', desc: 'Skróć sesję do N minut (tnie akcesoria)', group: 'modyfikacja' },
  { cmd: 'kontuzja', aliases: ['bol', 'ból'], args: 'kolano 6', desc: 'Zgłoś ból → zdarzenie + sesje do przejrzenia', group: 'zdarzenia' },
  { cmd: 'zglos', aliases: ['zgłoś', 'zdarzenie', 'report'], args: 'choroba 2 przeziębienie', desc: 'Zdarzenie: choroba, stres, sen, aktywnosc, waga, inne (nasilenie 1–3)', group: 'zdarzenia' },
  { cmd: 'waga', aliases: ['masa'], args: '85.2', desc: 'Zaloguj masę ciała (trend vs plan)', group: 'zdarzenia' },
  { cmd: 'stan', aliases: ['ocena', 'czy przegenerowac', 'zdarzenia'], desc: 'Wynik zdarzeń i sugestia przegenerowania', group: 'zdarzenia' },
  { cmd: 'prompt', aliases: ['ai'], desc: 'Kopiuj prompt startowy (profil + schemat)', group: 'ai' },
  { cmd: 'prompt korekta', aliases: ['korekta'], desc: 'Prompt korekty od bieżącego tygodnia', group: 'ai' },
  { cmd: 'importuj', aliases: ['import', 'wklej'], desc: 'Wklej JSON z AI (pełny plan albo patch)', group: 'ai' },
  { cmd: 'eksport', aliases: ['export'], desc: 'Pobierz plan jako JSON', group: 'ai' },
  { cmd: 'historia', aliases: ['history', 'wersje'], desc: 'Wersje planu (commity)', group: 'ai' },
  { cmd: 'cofnij', aliases: ['undo', 'revert'], desc: 'Przywróć poprzednią wersję planu', group: 'ai' },
  { cmd: 'demo', desc: 'Wygeneruj plan demonstracyjny z profilu', group: 'ai' },
  { cmd: 'pomoc', aliases: ['help', '?'], desc: 'Lista komend', group: 'nawigacja' },
];

export const LIFT_ALIASES: Record<string, 'squat' | 'bench' | 'deadlift' | 'ohp'> = {
  squat: 'squat',
  przysiad: 'squat',
  sq: 'squat',
  bench: 'bench',
  wyciskanie: 'bench',
  bp: 'bench',
  lawka: 'bench',
  deadlift: 'deadlift',
  martwy: 'deadlift',
  mc: 'deadlift',
  dl: 'deadlift',
  ohp: 'ohp',
  zolnierskie: 'ohp',
};
