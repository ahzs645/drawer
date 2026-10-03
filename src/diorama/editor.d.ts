export interface DioramaEditorOptions {
  scene: unknown;
  reference?: string;
  storageKey?: string;
  library?: Array<{name: string; url: string}>;
  onPublish?: (project: unknown) => void;
}
export interface DioramaController {
  getScene(): unknown;
  getSvg(): string;
  destroy(): void;
  selectImage(id: string): void;
  selectSite(id: string): void;
}
export function createDioramaEditor(host: HTMLElement, options: DioramaEditorOptions): DioramaController;
