import { map, of, tap } from 'rxjs';
import { FlowDef, GroupDef, StepDef } from '../engine/step-def';
import { toClientCardDto, toPreliminaryDto } from '../mappers/customer.mapper';
import { mapValidationIssues } from '../mappers/validation-error.mapper';
import { Customer, emptyCustomer } from '../models/customer.model';
import { ADRES_KLIENTA_STEP, ADRES_WYSYLKI_STEP } from './steps/adresy.steps';
import { DODATKOWE_STEP, dodatkoweIssues } from './steps/dodatkowe.steps';
import { EMAIL_STEP, IMIE_STEP, TELEFON_STEP } from './steps/podstawowe.steps';
import { POLECAJACY_STEP } from './steps/polecajacy.step';

/**
 * REJESTR PRZEPŁYWU — kolejność grup i kroków + rozmowa z backendem.
 * Nowy krok: plik w ./steps (szablon docs/templates/step.template.ts) + wpis w STEPS.
 * Nowa grupa: wpis w GROUPS + kolor --group-N w styles/tokens.css.
 */

export const GROUPS: GroupDef<Customer>[] = [
  {
    id: 'podstawowe',
    label: 'Dane podstawowe',
    color: 'var(--group-1)',
    // Po skompletowaniu danych podstawowych: wstępny zapis klienta (REST).
    onComplete: (ctx) =>
      ctx.api.savePreliminary(toPreliminaryDto(ctx.model), ctx.clientId).pipe(
        tap((res) => ctx.setClientId(res.clientId)),
        map((res) =>
          res.created
            ? `✓ Zapisano wstępne dane klienta · ${res.clientId}`
            : `✓ Zaktualizowano wstępne dane klienta · ${res.clientId}`,
        ),
      ),
  },
  { id: 'adresy', label: 'Adresy', color: 'var(--group-2)' },
  { id: 'polecajacy', label: 'Osoby polecające', color: 'var(--group-3)' },
];

const DEMO_GROUP: GroupDef<Customer> = {
  id: 'dodatkowe',
  label: 'Dane dodatkowe',
  color: 'var(--group-4)',
  // Po skompletowaniu sekcji: usługa zwraca błędy biznesowe (legitymacja, PKD) na pola/sekcje.
  onComplete: (ctx) => of({ issues: dodatkoweIssues(ctx.model) }),
};

export const STEPS: StepDef<Customer>[] = [
  IMIE_STEP,
  TELEFON_STEP,
  EMAIL_STEP,
  ADRES_KLIENTA_STEP,
  ADRES_WYSYLKI_STEP,
  POLECAJACY_STEP,
];

export interface FlowFeatures {
  /** Krok demonstracyjny z dodatkowymi typami pól (?demo=1). */
  demoFields: boolean;
}

export function buildFlow(features: FlowFeatures): FlowDef<Customer> {
  return {
    groups: features.demoFields ? [...GROUPS, DEMO_GROUP] : GROUPS,
    steps: features.demoFields ? [...STEPS, DODATKOWE_STEP] : STEPS,
    emptyModel: emptyCustomer,
    // DEMO: wstępne wczytanie danych klienta z zewnętrznego rejestru na starcie przepływu.
    prefill: features.demoFields
      ? (ctx) =>
          ctx.api.lookupClient().pipe(
            map((d) => ({
              patch: { imie: d.firstName, nazwisko: d.lastName, identyfikator: d.identifier },
              toast: `Wczytano z rejestru: ${d.firstName} ${d.lastName}`,
            })),
          )
      : undefined,
    title: (c) => `${c.imie} ${c.nazwisko}`.trim(),
    validateCard: (model, ctx) =>
      ctx.api.validateCard(toClientCardDto(model, ctx.clientId)).pipe(map(mapValidationIssues)),
  };
}
