import { LinkedListSnapshot, ListNode } from '../src/visualization/linkedListModel';
import { ExtensionMessage, WebviewMessage } from '../src/sidebar/messages';

declare function acquireVsCodeApi(): {
  postMessage(message: WebviewMessage): void;
  getState(): any;
  setState(state: any): void;
};

const vscode = acquireVsCodeApi();

// DOM Elements
const initialView = document.getElementById('initialView') as HTMLDivElement;
const loadingView = document.getElementById('loadingView') as HTMLDivElement;
const loadingText = document.getElementById('loadingText') as HTMLDivElement;
const loadingSubtext = document.getElementById('loadingSubtext') as HTMLDivElement;
const activeView = document.getElementById('activeView') as HTMLDivElement;
const errorView = document.getElementById('errorView') as HTMLDivElement;
const errorMessage = document.getElementById('errorMessage') as HTMLSpanElement;
const errorDetails = document.getElementById('errorDetails') as HTMLDivElement;

const badgeDot = document.getElementById('badgeDot') as HTMLSpanElement;
const badgeText = document.getElementById('badgeText') as HTMLSpanElement;
const stepChip = document.getElementById('stepChip') as HTMLSpanElement;
const vizDiagram = document.getElementById('vizDiagram') as HTMLDivElement;
const detachedContainer = document.getElementById('detachedContainer') as HTMLDivElement;
const detachedDiagram = document.getElementById('detachedDiagram') as HTMLDivElement;
const explanationText = document.getElementById('explanationText') as HTMLDivElement;
const historyBanner = document.getElementById('historyBanner') as HTMLDivElement;

// Buttons
const btnInitialVisualize = document.getElementById('btnInitialVisualize') as HTMLButtonElement;
const btnPrev = document.getElementById('btnPrev') as HTMLButtonElement;
const btnNext = document.getElementById('btnNext') as HTMLButtonElement;
const btnRestart = document.getElementById('btnRestart') as HTMLButtonElement;
const btnRetry = document.getElementById('btnRetry') as HTMLButtonElement;

function showView(view: 'initial' | 'loading' | 'active' | 'error') {
  initialView.style.display = view === 'initial' ? 'flex' : 'none';
  loadingView.style.display = view === 'loading' ? 'flex' : 'none';
  activeView.style.display = view === 'active' ? 'block' : 'none';
  errorView.style.display = view === 'error' ? 'flex' : 'none';
  btnRestart.style.display = view === 'active' || view === 'error' ? 'inline-flex' : 'none';
}

function updateBadge(status: 'idle' | 'running' | 'paused' | 'error' | 'terminated') {
  badgeDot.className = 'badge-dot';
  if (status === 'paused') {
    badgeDot.classList.add('active');
    badgeText.textContent = 'Paused';
  } else if (status === 'running') {
    badgeDot.classList.add('running');
    badgeText.textContent = 'Running';
  } else if (status === 'error') {
    badgeDot.classList.add('error');
    badgeText.textContent = 'Error';
  } else if (status === 'terminated') {
    badgeText.textContent = 'Terminated';
  } else {
    badgeText.textContent = 'Idle';
  }
}

function createArrowSvg(): string {
  return `
    <div class="arrow-segment">
      <svg class="arrow-svg" viewBox="0 0 28 16" fill="none">
        <path d="M2 8H22M22 8L16 4M22 8L16 12" stroke="#0066FF" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </div>
  `;
}

function renderNodeBox(node: ListNode, isHighlight: boolean = false): string {
  const highlightClass = isHighlight || node.isNewlyCreated || node.isNewlyConnected ? 'highlight' : '';
  const labelHtml = node.variableName ? `<span class="node-label">${node.variableName}</span>` : '';
  const nextIndicator = node.nextId ? '•' : '∅';

  return `
    <div class="node-wrapper">
      ${labelHtml}
      <div class="node-box ${highlightClass}" id="node-${node.id}">
        <div class="node-data">${node.data}</div>
        <div class="node-next">${nextIndicator}</div>
      </div>
    </div>
  `;
}

function renderDiagram(snapshot: LinkedListSnapshot) {
  // Clear diagrams
  vizDiagram.innerHTML = '';
  detachedDiagram.innerHTML = '';

  const { headId, nodes } = snapshot;
  const reachableNodes: ListNode[] = [];

  // 1. Follow chain from head
  if (headId) {
    let currId: string | null = headId;
    const visited = new Set<string>();
    while (currId && !visited.has(currId)) {
      visited.add(currId);
      const node = nodes.find((n) => n.id === currId);
      if (node) {
        reachableNodes.push(node);
        currId = node.nextId;
      } else {
        break;
      }
    }
  }

  // Render Head & Main List
  let mainHtml = `
    <div class="head-indicator">
      <span>head</span>
      ${createArrowSvg()}
    </div>
  `;

  if (reachableNodes.length === 0) {
    mainHtml += `<span class="null-badge">nullptr</span>`;
  } else {
    for (let i = 0; i < reachableNodes.length; i++) {
      const node = reachableNodes[i];
      mainHtml += renderNodeBox(node, node.isNewlyConnected);

      if (i < reachableNodes.length - 1) {
        mainHtml += createArrowSvg();
      } else {
        // Last node in chain
        if (node.nextId) {
          mainHtml += createArrowSvg();
          mainHtml += `<span class="null-badge">...</span>`;
        } else {
          mainHtml += createArrowSvg();
          mainHtml += `<span class="null-badge">nullptr</span>`;
        }
      }
    }
  }

  vizDiagram.innerHTML = mainHtml;

  // 2. Render Detached Local Allocations (e.g. first, second, third before connection)
  const detachedNodes = nodes.filter((n) => n.isDetached);
  if (detachedNodes.length > 0) {
    detachedContainer.style.display = 'block';
    let detachedHtml = '';
    for (let i = 0; i < detachedNodes.length; i++) {
      const node = detachedNodes[i];
      detachedHtml += renderNodeBox(node, true);
      if (node.nextId) {
        detachedHtml += createArrowSvg();
      } else {
        detachedHtml += createArrowSvg();
        detachedHtml += `<span class="null-badge">nullptr</span>`;
      }
      if (i < detachedNodes.length - 1) {
        detachedHtml += `<div style="width: 16px;"></div>`;
      }
    }
    detachedDiagram.innerHTML = detachedHtml;
  } else {
    detachedContainer.style.display = 'none';
  }
}

// Event Listeners
btnInitialVisualize.onclick = () => vscode.postMessage({ command: 'visualize' });
btnPrev.onclick = () => vscode.postMessage({ command: 'prev' });
btnNext.onclick = () => vscode.postMessage({ command: 'next' });
btnRestart.onclick = () => vscode.postMessage({ command: 'restart' });
btnRetry.onclick = () => vscode.postMessage({ command: 'retry' });

// Message Handler from Extension Host
window.addEventListener('message', (event) => {
  const msg: ExtensionMessage = event.data;

  switch (msg.command) {
    case 'status': {
      showView('loading');
      loadingText.textContent = msg.text;
      if (msg.step === 'compiling') {
        loadingSubtext.textContent = 'Compiling C++ source with -g -O0';
      } else if (msg.step === 'launching') {
        loadingSubtext.textContent = 'Launching GDB / LLDB debugger';
      } else if (msg.step === 'waiting') {
        loadingSubtext.textContent = 'Waiting for debugger stop at entry point';
      }
      updateBadge('running');
      break;
    }

    case 'updateState': {
      showView('active');
      const { snapshot, canStepNext, canStepPrev, canRestart, isPaused, isRunning } = msg;

      // Update badge
      if (isPaused) {
        updateBadge('paused');
      } else if (isRunning) {
        updateBadge('running');
      }

      // Step chip
      stepChip.textContent = `Step ${snapshot.stepNumber}`;

      // Explanation
      explanationText.textContent = snapshot.explanation;

      // History indicator
      if (snapshot.isHistorical) {
        historyBanner.style.display = 'inline-block';
        historyBanner.textContent = `Viewing step ${snapshot.stepNumber} of ${msg.totalSnapshots} (historical)`;
      } else {
        historyBanner.style.display = 'none';
      }

      // Controls enable/disable
      btnNext.disabled = !canStepNext;
      btnPrev.disabled = !canStepPrev;
      btnRestart.disabled = !canRestart;

      // Render diagrams
      renderDiagram(snapshot);
      break;
    }

    case 'error': {
      showView('error');
      updateBadge('error');
      errorMessage.textContent = msg.message;
      errorDetails.textContent = msg.details || '';
      btnRetry.style.display = msg.canRetry ? 'inline-flex' : 'none';
      break;
    }

    case 'sessionEnded': {
      updateBadge('terminated');
      btnNext.disabled = true;
      btnRestart.disabled = false;
      explanationText.textContent = msg.reason || 'Debugging session finished.';
      break;
    }
  }
});

// Initial View
showView('initial');
updateBadge('idle');
vscode.postMessage({ command: 'requestState' });
