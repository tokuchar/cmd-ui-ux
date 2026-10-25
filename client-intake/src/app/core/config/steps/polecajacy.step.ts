import { map } from 'rxjs';
import { formatDate } from '../../engine/field-types';
import { StepDef } from '../../engine/step-def';
import { fromReferralCandidateDto } from '../../mappers/person.mapper';
import { Customer, Person } from '../../models/customer.model';
import { PERSON_FIELDS } from '../person.schema';

/** Grupa „Osoby polecające" — krok 6 mockupu (kolekcja: kod → wybór ✕ → pytania o każdą osobę). */
export const POLECAJACY_STEP: StepDef<Customer> = {
  id: 'polecajacy',
  group: 'polecajacy',
  fields: [],
  collection: {
    target: 'polecajacy',
    label: 'Osoby polecające',
    sheetLabel: 'Poleceni',
    placeholder: 'Wpisz kod, np. #1234',
    hint: 'Wpisz kod polecający, aby wczytać osoby polecające. Dane testowe: <strong>#1234</strong>.',
    codePattern: /^#\d{3,6}$/,
    codeError: 'Kod w formacie #NNNN, np. #1234.',
    load: (code, ctx) => ctx.api.searchReferrals(code).pipe(map((list) => list.map(fromReferralCandidateDto))),
    itemLabel: (p: Person) => p.imie,
    itemDetail: (p: Person) =>
      [p.miasto, p.ostatniKontakt ? `ostatni kontakt ${formatDate(p.ostatniKontakt)}` : ''].filter(Boolean).join(' · '),
    itemFields: PERSON_FIELDS,
    summary: (items: Person[]) => `${items.length}: ` + items.map((r) => r.imie.split(' ')[0]).join(', '),
  },
};
