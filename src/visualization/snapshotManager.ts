import { LinkedListSnapshot } from './linkedListModel';

export class SnapshotManager {
  private snapshots: LinkedListSnapshot[] = [];
  private currentIndex: number = -1;

  public reset(): void {
    this.snapshots = [];
    this.currentIndex = -1;
  }

  public addSnapshot(snapshot: LinkedListSnapshot): void {
    // If we are currently browsing history and new live execution occurs,
    // we jump back to latest or append.
    this.snapshots.push(snapshot);
    this.currentIndex = this.snapshots.length - 1;
  }

  public getCurrentSnapshot(): LinkedListSnapshot | undefined {
    if (this.currentIndex >= 0 && this.currentIndex < this.snapshots.length) {
      const snap = this.snapshots[this.currentIndex];
      return {
        ...snap,
        isHistorical: this.currentIndex < this.snapshots.length - 1,
      };
    }
    return undefined;
  }

  public getLatestSnapshot(): LinkedListSnapshot | undefined {
    if (this.snapshots.length > 0) {
      return this.snapshots[this.snapshots.length - 1];
    }
    return undefined;
  }

  public canGoPrev(): boolean {
    return this.currentIndex > 0;
  }

  public canGoNextHistory(): boolean {
    return this.currentIndex < this.snapshots.length - 1;
  }

  public prev(): LinkedListSnapshot | undefined {
    if (this.canGoPrev()) {
      this.currentIndex--;
      return this.getCurrentSnapshot();
    }
    return undefined;
  }

  public nextHistory(): LinkedListSnapshot | undefined {
    if (this.canGoNextHistory()) {
      this.currentIndex++;
      return this.getCurrentSnapshot();
    }
    return undefined;
  }

  public get totalSnapshots(): number {
    return this.snapshots.length;
  }

  public get currentSnapshotIndex(): number {
    return this.currentIndex;
  }
}
