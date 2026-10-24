import { discoverGraphLayout } from '../debug/graphStateExtractor';

export type VisualizationMode = 'graph' | 'linked_list';

export function selectVisualizationMode(source: string): VisualizationMode {
  return discoverGraphLayout(source) ? 'graph' : 'linked_list';
}
