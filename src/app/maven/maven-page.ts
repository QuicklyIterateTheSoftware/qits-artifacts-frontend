import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink, convertToParamMap } from '@angular/router';
import { QitsButton } from '@qits/ui-components';
import { ArtifactsApi } from '../api/artifacts-api';
import type { MavenVersionDto } from '../api/dto';
import { Async } from '../ui/async'; import { Empty } from '../ui/empty';
import { formatBytes, formatInstant } from '../ui/format'; import { LOADING, failed, ready, type Loadable } from '../ui/loadable';
@Component({ selector: 'app-maven-page', changeDetection: ChangeDetectionStrategy.OnPush, imports: [Async, Empty, QitsButton, RouterLink], templateUrl: './maven-page.html', styleUrls: ['../ui/page.css'] })
export class MavenPage {
  private readonly api = inject(ArtifactsApi); private readonly params = toSignal(inject(ActivatedRoute).paramMap, { initialValue: convertToParamMap({}) });
  protected readonly repo = computed(() => this.params().get('repo') ?? ''); protected readonly coordinate = computed(() => this.params().get('coordinate') ?? '');
  protected readonly state = signal<Loadable<readonly MavenVersionDto[]>>(LOADING); protected readonly formatBytes = formatBytes; protected readonly formatInstant = formatInstant;
  protected readonly rows = computed(() => { const state = this.state(); return state.kind === 'ready' ? state.value : []; });
  constructor() { effect(() => { if (this.repo() && this.coordinate()) void this.load(); }); }
  protected async load(): Promise<void> { this.state.set(LOADING); try { this.state.set(ready(await this.api.mavenVersions(this.repo(), this.coordinate()))); } catch (error) { this.state.set(failed(error)); } }
}
