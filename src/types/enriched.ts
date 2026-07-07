import type { Wartungsprotokolle } from './app';

export type EnrichedWartungsprotokolle = Wartungsprotokolle & {
  wartungsartName: string;
};
