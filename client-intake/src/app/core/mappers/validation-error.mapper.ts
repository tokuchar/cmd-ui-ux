import { CardValidationDto } from '../api/api.models';
import { FieldIssue } from '../engine/field-def';

/**
 * Ścieżka błędu z API (ClientCardDto) → id pola w modelu (FieldDef.id).
 * `[]` oznacza indeks elementu listy i jest przenoszony 1:1 (`referrals[2].phone` → `polecajacy[2].telefon`).
 * MIGRACJA: dopisz tu każdą ścieżkę, którą zwraca walidacja karty (docs/MIGRATION.md, krok 6).
 */
export const ISSUE_PATH_MAP: { api: string; field: string }[] = [
  { api: 'client.firstName', field: 'imie' },
  { api: 'client.lastName', field: 'imie' },
  { api: 'client.phone', field: 'telefon' },
  { api: 'client.email', field: 'email' },
  { api: 'client.address', field: 'adres_klienta' },
  { api: 'client.birthDate', field: 'data_urodzenia' },
  { api: 'client.voivodeship', field: 'wojewodztwo' },
  { api: 'client.acquisitionSource', field: 'zrodlo' },
  { api: 'shipping.sameAsClient', field: 'wysylka_same' },
  { api: 'shipping.address', field: 'adres_wysylki' },
  { api: 'referrals[].fullName', field: 'polecajacy[].imie' },
  { api: 'referrals[].relation', field: 'polecajacy[].znam' },
  { api: 'referrals[].phone', field: 'polecajacy[].telefon' },
  { api: 'referrals', field: 'polecajacy' },
];

function toRegex(apiPath: string): RegExp {
  const escaped = apiPath.replace(/[.*+?^${}()|\\]/g, '\\$&').replace(/\[\]/g, '\\[(\\d+)\\]');
  return new RegExp(`^${escaped}$`);
}

const COMPILED = ISSUE_PATH_MAP.map((e) => ({ re: toRegex(e.api), field: e.field }));

export function mapIssuePath(apiPath: string | null): string | null {
  if (!apiPath) return null;
  for (const { re, field } of COMPILED) {
    const m = re.exec(apiPath);
    if (!m) continue;
    let i = 1;
    return field.replace(/\[\]/g, () => `[${m[i++]}]`);
  }
  return null;
}

export function mapValidationIssues(dto: CardValidationDto): FieldIssue[] {
  const seen = new Set<string>();
  const out: FieldIssue[] = [];
  for (const issue of dto.issues) {
    const fieldId = mapIssuePath(issue.path);
    const key = `${fieldId}|${issue.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ fieldId, message: issue.message, code: issue.code });
  }
  return out;
}
