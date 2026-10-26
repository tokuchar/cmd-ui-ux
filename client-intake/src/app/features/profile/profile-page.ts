import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { buildPlanPrompt } from '../../core/ai/prompt-builder';
import { APP_CONFIG } from '../../core/config/app-config';
import { labelOf } from '../../core/config/steps/helpers';
import { e1rm, relativeStrength } from '../../core/domain/calc';
import { IntakeEngine, SheetRow } from '../../core/engine/intake-engine';
import { AthleteProfile } from '../../core/models/athlete.model';
import { DictionaryService } from '../../core/services/dictionary.service';
import { ThemeService } from '../../core/services/theme.service';
import { ToastService } from '../../core/services/toast.service';
import { copyText } from '../../core/storage/clipboard';
import { downloadJson } from '../../core/storage/local-store';
import { AnimatedBackground } from '../intake/animated-background/animated-background';
import { ToastOutlet } from '../intake/toast-outlet/toast-outlet';
import { BodyMap } from './body-map';

interface Stat {
  label: string;
  value: string;
  unit?: string;
  hint?: string;
}

/**
 * „Dane podstawowe" — profil zebrany w intake: karta-hero z liczbami, kafle per grupa,
 * mapa kontuzji i akcje (prompt dla AI, eksport/import JSON, edycja w intake).
 */
@Component({
  selector: 'app-profile-page',
  templateUrl: './profile-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AnimatedBackground, BodyMap, RouterLink, ToastOutlet],
  host: { class: 'contents' },
})
export class ProfilePage {
  protected readonly engine = inject(IntakeEngine);
  protected readonly theme = inject(ThemeService);
  private readonly cfg = inject(APP_CONFIG);
  private readonly dict = inject(DictionaryService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  protected readonly a = this.engine.s.model;
  protected readonly progress = this.engine.s.totalProgress;
  protected readonly showPrompt = signal(false);

  protected readonly prompt = computed(() => buildPlanPrompt(this.cfg.flow, this.a(), this.dict));

  protected readonly hero = computed<Stat[]>(() => {
    const a = this.a();
    const bf = a.bodyfat_pct ? `${a.bodyfat_pct}` : a.bodyfat_zakres ? `~${a.bodyfat_zakres}` : '—';
    return [
      { label: 'Masa', value: a.masa_kg ? `${a.masa_kg}` : '—', unit: 'kg', hint: a.docelowa_masa_kg ? `cel ${a.docelowa_masa_kg} kg` : undefined },
      { label: 'Bodyfat', value: bf, unit: '%' },
      { label: 'Wiek', value: a.wiek !== null ? `${a.wiek}` : '—', unit: 'lat', hint: a.wzrost_cm ? `${a.wzrost_cm} cm` : undefined },
      { label: 'TDEE', value: a.tdee_szacowane ? `${a.tdee_szacowane}` : '—', hint: a.kcal_obecnie ? `kcal · je ${a.kcal_obecnie}` : 'kcal (szac.)' },
      { label: 'Sen', value: a.sen_godz ? `${a.sen_godz}` : '—', unit: 'h', hint: a.jakosc_snu ? `jakość ${a.jakosc_snu}/10` : undefined },
      { label: 'Kroki', value: a.kroki_dziennie ? `${Math.round(a.kroki_dziennie / 100) / 10}k` : '—', hint: a.praca ? labelOf('praca', a.praca).toLowerCase() : undefined },
    ];
  });

  protected readonly lifts = computed(() => {
    const a = this.a();
    const rows = [
      { label: 'Przysiad', max: a.e1rm_squat },
      { label: 'Wyciskanie', max: a.e1rm_bench },
      { label: 'Martwy', max: a.e1rm_deadlift },
    ];
    const top = Math.max(...rows.map((r) => r.max ?? 0), 1);
    return rows.map((r) => ({ ...r, pct: Math.round(((r.max ?? 0) / top) * 100) }));
  });

  protected readonly strength = computed(() => {
    const a = this.a();
    const ohp = e1rm(a.ohp || null);
    return {
      total: a.e1rm_total,
      ratio: relativeStrength(a.e1rm_total, a.masa_kg),
      target: Number(a.cel_total_kg) || null,
      ohp,
    };
  });

  protected readonly goalLine = computed(() => {
    const a = this.a();
    if (!a.cel_glowny) return 'Profil niekompletny — dokończ intake.';
    const parts = [labelOf('cel_glowny', a.cel_glowny), a.faza ? labelOf('faza', a.faza).toLowerCase() : ''];
    if (a.tempo) parts.push(`${a.tempo}%/tydz.`);
    if (a.kategoria_wagowa) parts.push(`kat. ${a.kategoria_wagowa} kg`);
    if (a.data_zawodow) parts.push(`start ${a.data_zawodow.split('-').reverse().join('.')}`);
    if (a.data_zawodow === '' && a.horyzont_tyg) parts.push(`${a.horyzont_tyg} tyg.`);
    return parts.filter(Boolean).join(' · ');
  });

  protected readonly injuries = computed(() => this.a().kontuzje ?? []);
  protected readonly goals = computed(() => this.a().cele_dodatkowe ?? []);
  protected readonly labelOf = labelOf;

  protected copyPrompt(): void {
    copyText(this.prompt()).then((ok) =>
      this.toast.show(ok ? `📋 Skopiowano prompt (${this.prompt().length} znaków) — wklej go do AI` : '⚠ Nie udało się skopiować — zaznacz tekst ręcznie'),
    );
  }

  protected exportJson(): void {
    downloadJson(`profil-${(this.a().imie || 'zawodnik').toLowerCase()}.json`, this.a());
  }

  protected importJson(input: HTMLInputElement): void {
    const file = input.files?.[0];
    if (!file) return;
    file.text().then((text) => {
      try {
        const data = JSON.parse(text) as Partial<AthleteProfile>;
        if (!data || typeof data !== 'object' || !('cel_glowny' in data)) throw new Error('to nie jest profil zawodnika');
        this.engine.loadProfile(data);
      } catch (e) {
        this.toast.show(`⚠ Nie wczytano pliku: ${(e as Error).message}`);
      }
      input.value = '';
    });
  }

  /** Edycja wiersza → command line w zakładce Intake (kursor ustawiony przed nawigacją). */
  protected edit(row: SheetRow): void {
    row.edit();
    this.router.navigate(['/intake'], { queryParams: { keep: 1 } });
  }

  protected painClass(pain: number | null): string {
    if (pain === null || pain < 4) return 'text-pain-low';
    return pain < 7 ? 'text-pain-mid' : 'text-pain-high';
  }
}
