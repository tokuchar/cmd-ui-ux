// SZABLON WALIDATORA — dopisz fabrykę do obiektu V w src/app/core/validation/validators.ts
// i test w validators.spec.ts. Wartość jest już po parse typu pola (np. data = ISO, telefon = 9 cyfr).
import { ValidatorFn } from '../../src/app/core/engine/field-def';

export const V_EXAMPLE = {
  /** <Opis reguły>. */
  <nazwa>(param: number, message = '<Domyślny komunikat po polsku, z przykładem>'): ValidatorFn {
    return (value, model) => {
      if (value === null || value === undefined || value === '') return null; // pustość obsługuje `required`
      const ok = /* <warunek> */ String(value).length >= param;
      return ok ? null : message;
    };
  },
};
