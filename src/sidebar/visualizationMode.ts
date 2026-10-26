import { discoverGraphLayout } from '../debug/graphStateExtractor';
import { TutorialManager } from '../tutorial/tutorialManager';

export type VisualizationMode = 'graph' | 'linked_list';

export function selectVisualizationMode(source: string): VisualizationMode {
  const activeTut = TutorialManager.getActiveTutorial();
  if (activeTut && activeTut.manifest.structureType === 'graph') {
    return 'graph';
  }
  return discoverGraphLayout(source) ? 'graph' : 'linked_list';
}
