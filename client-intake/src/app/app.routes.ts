import { Routes } from '@angular/router';
import { IntakePage } from './features/intake/intake-page';

/** Zakładki: Intake (ankieta) → Profil (dane podstawowe + prompt) → Plan (graf + komendy). */
export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'intake' },
  { path: 'intake', component: IntakePage, title: 'Intake · ideaTraining' },
  { path: 'profil', loadComponent: () => import('./features/profile/profile-page').then((m) => m.ProfilePage), title: 'Profil · ideaTraining' },
  { path: 'plan', loadComponent: () => import('./features/plan/plan-page').then((m) => m.PlanPage), title: 'Plan · ideaTraining' },
  { path: '**', redirectTo: 'intake' },
];
