import {
  LinkedListSnapshot,
  ListNode,
  ArrayVariable,
  IndexPointer,
  StackModel,
  QueueModel,
  StackElement,
  QueueSlot,
} from '../src/visualization/linkedListModel';
import { GraphSnapshot } from '../src/visualization/graphModel';
import {
  ExtensionMessage,
  isGraphUpdateStateMessage,
  WebviewMessage,
} from '../src/sidebar/messages';
import type { GraphEdge } from '../src/sidebar/edgeLinkHandler';
import {
  getGraphEdgeGeometry,
  getGraphEdgeLabel,
  getGraphEdgeMarker,
  calculateGraphCameraFit,
  hasNewGraphVertices,
  getGraphContentBounds,
  isGraphSnapshot,
  prepareGraphEdgeLanes,
  prepareGraphLayoutLinks,
} from './graphRenderer';
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCollide,
  forceX,
  forceY,
  Simulation,
  SimulationNodeDatum,
  SimulationLinkDatum,
} from 'd3-force';

declare function acquireVsCodeApi(): {
  postMessage(message: WebviewMessage): void;
  getState(): any;
  setState(state: any): void;
};

const vscode = acquireVsCodeApi();

// DOM Elements: Debugger Views
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
const cardTitle = document.getElementById('cardTitle') as HTMLSpanElement | null;
const canvasHint = document.getElementById('canvasHint') as HTMLDivElement | null;
const stepChip = document.getElementById('stepChip') as HTMLSpanElement;
const canvasTitle = document.querySelector('.card-title') as HTMLSpanElement;
const graphViewport = document.getElementById('graphViewport') as HTMLDivElement;
const graphCanvas = document.getElementById('graphCanvas') as HTMLDivElement;
const arrowsSvg = document.getElementById('arrowsSvg') as unknown as SVGSVGElement;
const arrowsGroup = document.getElementById('arrowsGroup') as unknown as SVGGElement | null;
const nodesLayer = document.getElementById('nodesLayer') as HTMLDivElement;
const explanationText = document.getElementById('explanationText') as HTMLDivElement;
const terminalPlaceholder = document.getElementById('terminalPlaceholder') as HTMLSpanElement;
const terminalText = document.getElementById('terminalText') as HTMLPreElement;
const btnClearTerminal = document.getElementById('btnClearTerminal') as HTMLButtonElement;
// Creative Mode Palette & Action Buttons
const btnInitialCreative = document.getElementById('btnInitialCreative') as HTMLButtonElement | null;
const creativePalette = document.getElementById('creativePalette') as HTMLElement | null;
const dockAddNode = document.getElementById('dockAddNode') as HTMLElement | null;
const dockAddStack = document.getElementById('dockAddStack') as HTMLElement | null;
const dockAddQueue = document.getElementById('dockAddQueue') as HTMLElement | null;

// Visual Link Mode state: click NEXT cell or click two graph nodes to wire them in source code.
let linkMode = false;
let linkSourceId: string | null = null;

function setLinkMode(on: boolean) {
  linkMode = on;
  document.body.classList.toggle('link-mode', on);
  if (canvasHint) {
    canvasHint.textContent = on
      ? 'Link Mode: tap target node to connect next pointer (Esc to cancel)'
      : 'Drag nodes to move • Right-click drag to pan • Scroll to zoom';
  }
  if (!on) clearLinkSelection();
}

function clearLinkSelection() {
  linkSourceId = null;
  document.querySelectorAll('.graph-node.link-source, .graph-node.link-target').forEach((el) => {
    el.classList.remove('link-source', 'link-target');
  });
  document.querySelectorAll('.graph-node-next-cell.next-selected').forEach((el) => {
    el.classList.remove('next-selected');
  });
  if (canvasHint && !linkMode) {
    canvasHint.textContent = 'Drag nodes to move • Right-click drag to pan • Scroll to zoom';
  }
}

/**
 * Node tap handler: Handles clicking the NEXT cell to initiate linking,
 * and selecting a target node to wire source->next = target in C++.
 * ONLY active in Creative Mode!
 */
function onNodeTap(id: string, clickedEl?: HTMLElement) {
  // Only allow interactive linking in creative mode!
  if (!isCreativeMode) return;

  const rawId = id.replace(/^node-/, '');
  const nodeEl = document.getElementById(`node-${rawId}`) || document.getElementById(id);
  const isNextCell = Boolean(
    clickedEl?.closest('.graph-node-next-cell') ||
    (nodeEl && clickedEl && (clickedEl === nodeEl || nodeEl.contains(clickedEl)) &&
     (clickedEl.getBoundingClientRect().left - nodeEl.getBoundingClientRect().left > nodeEl.offsetWidth * 0.45))
  );

  // 1. If user tapped on the NEXT block:
  if (isNextCell) {
    if (linkSourceId === rawId || linkSourceId === id) {
      clearLinkSelection();
      setLinkMode(false);
      return;
    }
    clearLinkSelection();
    linkSourceId = rawId;
    if (nodeEl) {
      nodeEl.classList.add('link-source');
      const nextCell = nodeEl.querySelector('.graph-node-next-cell');
      if (nextCell) nextCell.classList.add('next-selected');
    }
    setLinkMode(true);
    const listSnap = currentSnapshot && !isGraphSnapshot(currentSnapshot) ? currentSnapshot : null;
    const srcNode = listSnap?.nodes.find((n: ListNode) => n.id === rawId || n.id === id || n.variableName === rawId);
    const srcName = srcNode?.variableName || srcNode?.data || rawId;
    if (canvasHint) {
      canvasHint.textContent = `Linking from ${srcName}: now tap target node to connect next pointer (Esc to cancel)`;
    }
    return;
  }

  // 2. If no source node selected yet via NEXT cell:
  if (!linkSourceId) {
    return;
  }

  // If tapped the same node as source: cancel
  if (linkSourceId === rawId || linkSourceId === id) {
    clearLinkSelection();
    setLinkMode(false);
    return;
  }

  // We have both source and target nodes!
  const listSnap = currentSnapshot && !isGraphSnapshot(currentSnapshot) ? currentSnapshot : null;
  const sourceNode = listSnap?.nodes.find((n: ListNode) => n.id === linkSourceId || n.variableName === linkSourceId);
  const targetNode = listSnap?.nodes.find((n: ListNode) => n.id === rawId || n.id === id || n.variableName === rawId);

  if (!sourceNode || !targetNode || !currentSnapshot) {
    clearLinkSelection();
    setLinkMode(false);
    return;
  }

  const filePath = currentSnapshot.source?.file || '';
  const sName = sourceNode.variableName || String(sourceNode.data);
  const tName = targetNode.variableName || String(targetNode.data);

  // Connect them in local snapshot model immediately
  sourceNode.nextId = targetNode.id;
  targetNode.isDetached = false;

  const edge: GraphEdge = {
    source: {
      id: sourceNode.id,
      name: sName,
      label: String(sourceNode.data),
      data: sourceNode.data,
      file: filePath,
    },
    target: {
      id: targetNode.id,
      name: tName,
      label: String(targetNode.data),
      data: targetNode.data,
      file: filePath,
    },
    kind: 'member-bind',
    wiringCode: `${sName}->next = ${tName};`,
  };

  vscode.postMessage({ command: 'createEdge', edge });
  vscode.postMessage({ command: 'creativeConnect', sourceVar: sName, targetVar: tName });

  // Update canvas instantly with the newly connected spring link!
  renderDiagram(currentSnapshot, false);
  clearLinkSelection();
  setLinkMode(false);

  // Flash connected nodes
  const flash = (nid: string, cls: string) => {
    const el = document.getElementById(`node-${nid}`) || document.getElementById(nid);
    if (el) {
      el.classList.add(cls);
      setTimeout(() => el.classList.remove(cls), 2000);
    }
  };
  flash(sourceNode.id, 'link-source');
  flash(targetNode.id, 'link-target');

  const prev = terminalText.textContent || '';
  terminalText.style.display = 'block';
  if (terminalPlaceholder) terminalPlaceholder.style.display = 'none';
  terminalText.textContent = prev + `\n[Linked] ${sName}->next = ${tName}; in C++`;
  const vp = document.getElementById('terminalViewport');
  if (vp) vp.scrollTop = vp.scrollHeight;
}

function updateTerminal(output?: string) {
  if (output && output.length > 0) {
    if (terminalPlaceholder) terminalPlaceholder.style.display = 'none';
    if (terminalText) {
      terminalText.style.display = 'block';
      terminalText.textContent = output;
    }
    const vp = document.getElementById('terminalViewport');
    if (vp) vp.scrollTop = vp.scrollHeight;
  } else {
    if (terminalPlaceholder) terminalPlaceholder.style.display = 'inline';
    if (terminalText) {
      terminalText.style.display = 'none';
      terminalText.textContent = '';
    }
  }
}

if (btnClearTerminal) {
  btnClearTerminal.addEventListener('click', () => {
    updateTerminal('');
  });
}

// Buttons
const btnInitialVisualize = document.getElementById('btnInitialVisualize') as HTMLButtonElement;
const btnVisualizeText = document.getElementById('btnVisualizeText') as HTMLElement | null;
const targetFileName = document.getElementById('targetFileName') as HTMLElement | null;
const btnExampleStack = document.getElementById('btnExampleStack') as HTMLButtonElement | null;
const btnExampleArray = document.getElementById('btnExampleArray') as HTMLButtonElement | null;
const btnExampleLinkedList = document.getElementById('btnExampleLinkedList') as HTMLButtonElement | null;
const btnExampleTree = document.getElementById('btnExampleTree') as HTMLButtonElement | null;
const btnImportTutorial = document.getElementById('btnImportTutorial') as HTMLButtonElement | null;
const tutorialDrawer = document.getElementById('tutorialDrawer') as HTMLElement | null;
const tutorialTitle = document.getElementById('tutorialTitle') as HTMLElement | null;
const btnCloseTutorial = document.getElementById('btnCloseTutorial') as HTMLButtonElement | null;
const lessonSelect = document.getElementById('lessonSelect') as HTMLSelectElement | null;
const lessonGuideCard = document.getElementById('lessonGuideCard') as HTMLElement | null;
const lessonGuideToggle = document.getElementById('lessonGuideToggle') as HTMLElement | null;
const lessonGuideIcon = document.getElementById('lessonGuideIcon') as HTMLElement | null;
const lessonGuideBody = document.getElementById('lessonGuideBody') as HTMLElement | null;

function renderSimpleMarkdown(md: string): string {
  if (!md) return '';
  const lines = md.split('\n');
  const htmlLines: string[] = [];
  let inList = false;

  for (let rawLine of lines) {
    let line = rawLine
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Headers
    if (line.startsWith('### ')) {
      if (inList) { htmlLines.push('</ul>'); inList = false; }
      htmlLines.push(`<h4 class="guide-h4">${line.slice(4)}</h4>`);
      continue;
    }
    if (line.startsWith('## ')) {
      if (inList) { htmlLines.push('</ul>'); inList = false; }
      htmlLines.push(`<h3 class="guide-h3">${line.slice(3)}</h3>`);
      continue;
    }
    if (line.startsWith('# ')) {
      if (inList) { htmlLines.push('</ul>'); inList = false; }
      htmlLines.push(`<h2 class="guide-h2">${line.slice(2)}</h2>`);
      continue;
    }

    // List items
    const listMatch = line.match(/^\s*[-*]\s+(.*)$/);
    if (listMatch) {
      if (!inList) {
        htmlLines.push('<ul class="guide-list">');
        inList = true;
      }
      let content = listMatch[1]
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/\*([^*]+)\*/g, '<em>$1</em>')
        .replace(/`([^`]+)`/g, '<code class="guide-code">$1</code>');
      htmlLines.push(`<li>${content}</li>`);
      continue;
    } else {
      if (inList) {
        htmlLines.push('</ul>');
        inList = false;
      }
    }

    // Empty lines
    if (!line.trim()) {
      htmlLines.push('<div class="guide-spacer"></div>');
      continue;
    }

    // Inline formatting for paragraphs
    let formatted = line
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code class="guide-code">$1</code>');
    htmlLines.push(`<p class="guide-p">${formatted}</p>`);
  }

  if (inList) {
    htmlLines.push('</ul>');
  }

  return htmlLines.join('\n');
}

const btnPrev = document.getElementById('btnPrev') as HTMLButtonElement;
const btnNext = document.getElementById('btnNext') as HTMLButtonElement;
const btnRestart = document.getElementById('btnRestart') as HTMLButtonElement;
const btnRetry = document.getElementById('btnRetry') as HTMLButtonElement;
const btnResetLayout = document.getElementById('btnResetLayout') as HTMLButtonElement;

// Interactive Graph State
interface NodePos {
  x: number;
  y: number;
  width: number;
  height: number;
}

const nodePositions = new Map<string, NodePos>();
type RenderSnapshot = LinkedListSnapshot | GraphSnapshot;
let currentSnapshot: RenderSnapshot | null = null;

// ==========================================
// 1. D3-Force Physics Engine (d3-force)
// ==========================================
export interface D3GraphNode extends SimulationNodeDatum {
  id: string;
  el: HTMLElement;
  width: number;
  height: number;
  radius: number;
  targetX: number;
  targetY: number;
  nodeType: 'node' | 'ptr' | 'null';
}

export interface D3GraphLink extends SimulationLinkDatum<D3GraphNode> {
  source: string | D3GraphNode;
  target: string | D3GraphNode;
  distance: number;
  strength: number;
}

let simulation: Simulation<D3GraphNode, D3GraphLink> | null = null;
const d3NodesMap = new Map<string, D3GraphNode>();
let d3Links: D3GraphLink[] = [];
let cancelActiveNodeDrag: (() => void) | null = null;

function onSimulationTick() {
  for (const node of d3NodesMap.values()) {
    if (node.x !== undefined && node.y !== undefined) {
      const actualWidth = node.el.offsetWidth > 0 ? node.el.offsetWidth : node.width;
      const actualHeight = node.el.offsetHeight > 0 ? node.el.offsetHeight : node.height;
      node.width = actualWidth;
      node.height = actualHeight;
      node.radius = Math.min(actualWidth, actualHeight) / 2 + 6;

      const left = Math.max(8, node.x - actualWidth / 2);
      const top = Math.max(8, node.y - actualHeight / 2);
      node.el.style.left = `${left}px`;
      node.el.style.top = `${top}px`;
      nodePositions.set(node.id, {
        x: left,
        y: top,
        width: actualWidth,
        height: actualHeight,
      });
    }
  }
  renderArrows();
  applyPendingGraphFit();
}

function initOrUpdateSimulation(nodes: D3GraphNode[], links: D3GraphLink[], isReset: boolean = false) {
  if (!simulation) {
    simulation = forceSimulation<D3GraphNode>(nodes)
      .force(
        'link',
        forceLink<D3GraphNode, D3GraphLink>(links)
          .id((d) => d.id)
          .distance((l) => l.distance)
          .strength((l) => l.strength)
      )
      .force(
        'charge',
        forceManyBody<D3GraphNode>()
          .strength((d) => (d.nodeType === 'node' ? -220 : -90))
          .distanceMax(380)
      )
      .force(
        'collide',
        forceCollide<D3GraphNode>()
          .radius((d) => d.radius + 10)
          .iterations(3)
      )
      .force(
        'centerX',
        forceX<D3GraphNode>()
          .x((d) => d.targetX)
          .strength(0.025)
      )
      .force(
        'centerY',
        forceY<D3GraphNode>()
          .y((d) => d.targetY)
          .strength(0.025)
      )
      .velocityDecay(0.32)
      .alphaDecay(0.018);

    simulation.on('tick', onSimulationTick);
  } else {
    simulation.nodes(nodes);
    const linkForce = simulation.force<ReturnType<typeof forceLink<D3GraphNode, D3GraphLink>>>('link');
    if (linkForce) {
      linkForce.links(links);
    }
  }

  if (isReset) {
    simulation.alpha(1).restart();
  } else {
    simulation.alpha(0.6).restart();
  }
}

function clearSimulation() {
  if (!simulation) return;
  simulation.stop();
  simulation.alphaTarget(0);
  simulation.nodes([]);
  const linkForce = simulation.force<
    ReturnType<typeof forceLink<D3GraphNode, D3GraphLink>>
  >('link');
  linkForce?.links([]);
}

function registerD3Node(
  id: string,
  el: HTMLElement,
  targetCenterX: number,
  targetCenterY: number,
  fallbackWidth: number,
  fallbackHeight: number,
  nodeType: 'node' | 'ptr' | 'null',
  reset: boolean = false
): D3GraphNode {
  let node = d3NodesMap.get(id);
  const width = el.offsetWidth > 0 ? el.offsetWidth : fallbackWidth;
  const height = el.offsetHeight > 0 ? el.offsetHeight : fallbackHeight;
  const radius = Math.min(width, height) / 2 + 6;

  if (!node || reset) {
    const initialY = reset ? targetCenterY : targetCenterY - 14;
    node = {
      id,
      el,
      width,
      height,
      radius,
      targetX: targetCenterX,
      targetY: targetCenterY,
      nodeType,
      x: targetCenterX,
      y: initialY,
      vx: 0,
      vy: reset ? 0 : 1.2,
      fx: null,
      fy: null,
    };
    d3NodesMap.set(id, node);
  } else {
    node.el = el;
    node.width = width;
    node.height = height;
    node.radius = radius;
    node.targetX = targetCenterX;
    node.targetY = targetCenterY;
    node.nodeType = nodeType;
  }

  const posX = node.x !== undefined ? node.x : targetCenterX;
  const posY = node.y !== undefined ? node.y : targetCenterY;
  const left = posX - width / 2;
  const top = posY - height / 2;
  node.el.style.left = `${left}px`;
  node.el.style.top = `${top}px`;
  nodePositions.set(id, { x: left, y: top, width, height });
  return node;
}

function formatMemoryAddress(addr?: string | null, fallbackId?: string): string {
  if (!addr) return fallbackId || '0x0';
  const match = addr.match(/0x0*([0-9a-fA-F]+)/);
  if (match) {
    return `0x${match[1].toLowerCase()}`;
  }
  return addr;
}

function getNextAddressDisplay(node: ListNode): string {
  if (node.nextId) {
    const listSnapshot = currentSnapshot && !isGraphSnapshot(currentSnapshot)
      ? currentSnapshot
      : null;
    const target = listSnapshot?.nodes.find((n) => n.id === node.nextId);
    if (target?.address) {
      return formatMemoryAddress(target.address, 'nullptr');
    }
    return node.nextId;
  }
  const listSnapshot = currentSnapshot && !isGraphSnapshot(currentSnapshot)
    ? currentSnapshot
    : null;
  if (node.nextAddress && listSnapshot?.nodes.some((n) => n.address === node.nextAddress)) {
    return formatMemoryAddress(node.nextAddress, 'nullptr');
  }
  return 'nullptr';
}

// ==========================================
// 2. Camera Navigation (Pan, Zoom, Pinch Cursor)
// ==========================================
let cameraPanX = 0;
let cameraPanY = 0;
let cameraZoom = 1.0;
let isPanning = false;
let startPanClientX = 0;
let startPanClientY = 0;
let initialPanX = 0;
let initialPanY = 0;
let isSpacePressed = false;
let graphFitPending = false;

function applyCameraTransform(smooth: boolean = false) {
  if (smooth) {
    graphCanvas.style.transition = 'transform 0.25s cubic-bezier(0.2, 0, 0, 1)';
    setTimeout(() => {
      graphCanvas.style.transition = 'none';
    }, 260);
  } else {
    graphCanvas.style.transition = 'none';
  }
  graphCanvas.style.transformOrigin = '0 0';
  graphCanvas.style.transform = `translate(${cameraPanX}px, ${cameraPanY}px) scale(${cameraZoom})`;

  // Update background grid of viewport
  const gridSize = 16 * cameraZoom;
  graphViewport.style.backgroundSize = `${gridSize}px ${gridSize}px`;
  graphViewport.style.backgroundPosition = `${cameraPanX}px ${cameraPanY}px`;
}

function resetCameraView(smooth: boolean = true) {
  cameraPanX = 0;
  cameraPanY = 0;
  cameraZoom = 1.0;
  applyCameraTransform(smooth);
}

function applyPendingGraphFit(): void {
  if (!graphFitPending || !currentSnapshot || !isGraphSnapshot(currentSnapshot)) return;
  const bounds = getGraphContentBounds(currentSnapshot.graph, nodePositions);
  if (!bounds) return;
  const fit = calculateGraphCameraFit(
    bounds,
    graphViewport.clientWidth,
    graphViewport.clientHeight
  );
  if (!fit) return;

  cameraZoom = fit.scale;
  cameraPanX = fit.panX;
  cameraPanY = fit.panY;
  graphFitPending = false;
  applyCameraTransform(true);
}

function showView(view: 'initial' | 'loading' | 'active' | 'error') {
  initialView.style.display = view === 'initial' ? 'flex' : 'none';
  loadingView.style.display = view === 'loading' ? 'flex' : 'none';
  activeView.style.display = view === 'active' ? 'block' : 'none';
  errorView.style.display = view === 'error' ? 'flex' : 'none';

  btnRestart.style.display = view === 'active' || view === 'error' ? 'inline-flex' : 'none';
  const homeBtn = document.getElementById('btnHome');
  if (homeBtn) homeBtn.style.display = view === 'active' || view === 'error' ? 'inline-flex' : 'none';

  if (creativePalette) {
    creativePalette.style.display = (view === 'active' && isCreativeMode) ? 'flex' : 'none';
  }
}

// Satisfying physical spring overshoot bounce-back draggable for Stack and Queue elements
function makeSpringDraggable(el: HTMLElement) {
  el.onpointerdown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    el.setPointerCapture(e.pointerId);
    el.classList.add('dragging');
    el.style.transition = 'none';

    const startX = e.clientX;
    const startY = e.clientY;

    const onPointerMove = (moveEv: PointerEvent) => {
      moveEv.preventDefault();
      const dx = moveEv.clientX - startX;
      const dy = moveEv.clientY - startY;
      el.style.transform = `translate(${dx}px, ${dy}px) scale(1.08)`;
    };

    const onPointerUp = (upEv: PointerEvent) => {
      try {
        el.releasePointerCapture(upEv.pointerId);
      } catch {}

      el.classList.remove('dragging');
      // Satisfying spring overshoot bounce-back
      el.style.transition = 'transform 0.52s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.3s ease';
      el.style.transform = 'translate(0px, 0px) scale(1)';

      setTimeout(() => {
        if (!el.classList.contains('dragging')) {
          el.style.transition = '';
          el.style.transform = '';
        }
      }, 550);

      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', onPointerUp);
      el.removeEventListener('pointercancel', onPointerUp);
    };

    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', onPointerUp);
    el.addEventListener('pointercancel', onPointerUp);
  };
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

// Make DOM elements draggable with live arrow updates & zoom support
function makeDraggable(el: HTMLElement, id: string, onTap?: (id: string, clickedEl?: HTMLElement) => void) {
  el.onpointerdown = (e: PointerEvent) => {
    // Left click only (Right click and middle click are for panning)
    if (e.button !== 0 || isSpacePressed) return;
    e.preventDefault();
    e.stopPropagation();

    const d3Node = d3NodesMap.get(id);
    if (!d3Node || !simulation) return;

    cancelActiveNodeDrag?.();
    el.setPointerCapture(e.pointerId);
    el.classList.add('dragging');

    // Wake simulation with target alpha so attached nodes continuously spring and bounce while dragging
    const activeSimulation = simulation;
    activeSimulation.alphaTarget(0.5).restart();
    d3Node.fx = d3Node.x;
    d3Node.fy = d3Node.y;

    const startMouseX = e.clientX;
    const startMouseY = e.clientY;
    const startNodeCenterX = d3Node.x!;
    const startNodeCenterY = d3Node.y!;

    const onPointerMove = (moveEv: PointerEvent) => {
      const dx = (moveEv.clientX - startMouseX) / cameraZoom;
      const dy = (moveEv.clientY - startMouseY) / cameraZoom;
      d3Node.fx = Math.max(d3Node.width / 2 + 8, startNodeCenterX + dx);
      d3Node.fy = Math.max(d3Node.height / 2 + 8, startNodeCenterY + dy);
      d3Node.targetX = d3Node.fx;
      d3Node.targetY = d3Node.fy;
    };

    let dragFinished = false;
    const finishDrag = (pointerId: number, upEv?: PointerEvent) => {
      if (dragFinished) return;
      dragFinished = true;
      try {
        el.releasePointerCapture(pointerId);
      } catch {}
      el.classList.remove('dragging');

      if (d3Node.x !== undefined && d3Node.y !== undefined) {
        d3Node.targetX = d3Node.x;
        d3Node.targetY = d3Node.y;
      }

      // Release fx & fy so the spring links pull and oscillate with bounce back!
      d3Node.fx = null;
      d3Node.fy = null;

      // Lower alphaTarget and give a lively alpha bump so it bounces back into spring equilibrium
      activeSimulation.alphaTarget(0);
      activeSimulation.alpha(0.6).restart();

      if (upEv) {
        // A tap (press + release without meaningful drag) selects the node in Link Mode.
        // Use a generous threshold (12px) so slight finger/mouse jitter doesn't cancel the tap.
        const wasTap =
          upEv.button === 0 &&
          Math.abs(upEv.clientX - startMouseX) <= 12 &&
          Math.abs(upEv.clientY - startMouseY) <= 12;
        if (wasTap) {
          const clickedEl =
            (document.elementFromPoint(upEv.clientX, upEv.clientY) as HTMLElement) || (upEv.target as HTMLElement);
          onTap?.(id, clickedEl);
        }
      }

      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', onPointerUp);
      el.removeEventListener('pointercancel', onPointerUp);
      if (cancelActiveNodeDrag === cancelDrag) {
        cancelActiveNodeDrag = null;
      }
    };
    const onPointerUp = (upEv: PointerEvent) => finishDrag(upEv.pointerId, upEv);
    const cancelDrag = () => finishDrag(e.pointerId);

    cancelActiveNodeDrag = cancelDrag;
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', onPointerUp);
    el.addEventListener('pointercancel', onPointerUp);
  };
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface PerimeterPoint {
  x: number;
  y: number;
  nx: number;
  ny: number;
}

/**
 * Calculates the exact intersection point on the perimeter of a bounding box
 * along the ray pointing towards targetCenter (Floating Edges algorithm).
 */
function getPerimeterIntersection(rect: Rect, targetCenter: { x: number; y: number }): PerimeterPoint {
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const dx = targetCenter.x - cx;
  const dy = targetCenter.y - cy;

  if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) {
    return { x: cx + rect.width / 2, y: cy, nx: 1, ny: 0 };
  }

  const halfW = rect.width / 2;
  const halfH = rect.height / 2;

  const tx = halfW / Math.abs(dx);
  const ty = halfH / Math.abs(dy);

  if (tx <= ty) {
    const signX = dx > 0 ? 1 : -1;
    return {
      x: cx + signX * halfW,
      y: cy + dy * tx,
      nx: signX,
      ny: 0,
    };
  } else {
    const signY = dy > 0 ? 1 : -1;
    return {
      x: cx + dx * ty,
      y: cy + signY * halfH,
      nx: 0,
      ny: signY,
    };
  }
}

/**
 * Calculates the exact intersection point on the perimeter of a rounded capsule (pill),
 * correctly handling flat edges and semicircular end caps at any angle.
 */
function getCapsulePerimeter(rect: Rect, target: { x: number; y: number }): PerimeterPoint {
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const dx = target.x - cx;
  const dy = target.y - cy;
  const dist = Math.hypot(dx, dy);

  if (dist < 0.001) {
    return { x: cx + rect.width / 2, y: cy, nx: 1, ny: 0 };
  }

  if (rect.width >= rect.height) {
    const R = rect.height / 2;
    const straightHalfW = Math.max(0, rect.width / 2 - R);

    if (Math.abs(dy) > 0.001 && Math.abs(dx) * R <= straightHalfW * Math.abs(dy)) {
      const signY = dy > 0 ? 1 : -1;
      const t = R / Math.abs(dy);
      return {
        x: cx + dx * t,
        y: cy + signY * R,
        nx: 0,
        ny: signY,
      };
    }

    const signX = dx >= 0 ? 1 : -1;
    const capCenterX = cx + signX * straightHalfW;
    const capCenterY = cy;

    const capDx = target.x - capCenterX;
    const capDy = target.y - capCenterY;
    const capDist = Math.hypot(capDx, capDy) || 1;
    const nx = capDx / capDist;
    const ny = capDy / capDist;

    return {
      x: capCenterX + nx * R,
      y: capCenterY + ny * R,
      nx,
      ny,
    };
  } else {
    const R = rect.width / 2;
    const straightHalfH = Math.max(0, rect.height / 2 - R);

    if (Math.abs(dx) > 0.001 && Math.abs(dy) * R <= straightHalfH * Math.abs(dx)) {
      const signX = dx > 0 ? 1 : -1;
      const t = R / Math.abs(dx);
      return {
        x: cx + signX * R,
        y: cy + dy * t,
        nx: signX,
        ny: 0,
      };
    }

    const signY = dy >= 0 ? 1 : -1;
    const capCenterX = cx;
    const capCenterY = cy + signY * straightHalfH;

    const capDx = target.x - capCenterX;
    const capDy = target.y - capCenterY;
    const capDist = Math.hypot(capDx, capDy) || 1;
    const nx = capDx / capDist;
    const ny = capDy / capDist;

    return {
      x: capCenterX + nx * R,
      y: capCenterY + ny * R,
      nx,
      ny,
    };
  }
}

/**
 * Calculates the exact intersection point on the perimeter of a circular node
 * along the ray towards or from targetPoint.
 */
function getCirclePerimeterIntersection(
  circleCenter: { x: number; y: number },
  radius: number,
  targetPoint: { x: number; y: number }
): PerimeterPoint {
  const dx = targetPoint.x - circleCenter.x;
  const dy = targetPoint.y - circleCenter.y;
  const dist = Math.hypot(dx, dy) || 1;
  const nx = dx / dist;
  const ny = dy / dist;
  return {
    x: circleCenter.x + nx * radius,
    y: circleCenter.y + ny * radius,
    nx,
    ny,
  };
}

// Draw smooth bezier curved arrows seamlessly anchored to box borders
function drawBezierArrow(
  startX: number,
  startY: number,
  startNx: number,
  startNy: number,
  endX: number,
  endY: number,
  endOutwardNx: number,
  endOutwardNy: number,
  isMuted: boolean = false,
  color: string = '#0066FF'
) {
  const dist = Math.hypot(endX - startX, endY - startY);
  const curvature = Math.max(16, Math.min(80, dist * 0.38));

  const cp1x = startX + startNx * curvature;
  const cp1y = startY + startNy * curvature;
  const cp2x = endX + endOutwardNx * curvature;
  const cp2y = endY + endOutwardNy * curvature;

  const d = `M ${startX} ${startY} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${endX} ${endY}`;
  const pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  pathEl.setAttribute('d', d);
  pathEl.setAttribute('stroke', isMuted ? '#737D8C' : color);
  pathEl.setAttribute('stroke-width', '1.8');
  pathEl.setAttribute('stroke-linecap', 'butt');
  pathEl.setAttribute('fill', 'none');

  let marker = 'url(#arrowHead)';
  if (isMuted) {
    marker = 'url(#arrowHeadMuted)';
  } else if (color === '#36C779' || color.toLowerCase() === '#238636') {
    marker = 'url(#arrowHeadGreen)';
  } else if (color === '#1F6FEB' || color.toLowerCase() === '#1f6feb') {
    marker = 'url(#arrowHeadBlue)';
  }
  pathEl.setAttribute('marker-end', marker);
  if (arrowsGroup) {
    arrowsGroup.appendChild(pathEl);
  } else {
    arrowsSvg.appendChild(pathEl);
  }
}

function renderGraphArrows(snapshot: GraphSnapshot) {
  const lanes = prepareGraphEdgeLanes(snapshot.graph.edges);
  const validVertexIds = new Set(snapshot.graph.vertices.map((vertex) => vertex.id));

  for (const edge of snapshot.graph.edges) {
    if (!validVertexIds.has(edge.sourceId) || !validVertexIds.has(edge.targetId)) continue;
    const sourcePos = nodePositions.get(edge.sourceId);
    const targetPos = nodePositions.get(edge.targetId);
    const lane = lanes.get(edge.id);
    if (!sourcePos || !targetPos || !lane) continue;

    const source = {
      x: sourcePos.x + sourcePos.width / 2,
      y: sourcePos.y + sourcePos.height / 2,
    };
    const target = {
      x: targetPos.x + targetPos.width / 2,
      y: targetPos.y + targetPos.height / 2,
    };
    const sourceRadius = Math.min(sourcePos.width, sourcePos.height) / 2;
    const targetRadius = Math.min(targetPos.width, targetPos.height) / 2;
    const geometry = getGraphEdgeGeometry(
      source,
      target,
      Math.min(sourceRadius, targetRadius),
      lane
    );
    const isHighlighted =
      edge.isTraversed === true || snapshot.activeEdgeId === edge.id;
    const color = isHighlighted ? '#36C779' : '#0066FF';
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('class', 'graph-edge');
    path.setAttribute('data-edge-id', edge.id);
    path.setAttribute('d', geometry.path);
    path.setAttribute('stroke', color);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke-width', isHighlighted ? '2.4' : '1.8');
    path.setAttribute('stroke-linecap', 'round');
    const marker = getGraphEdgeMarker(edge, isHighlighted);
    if (marker) {
      path.setAttribute('marker-end', marker);
    }
    if (arrowsGroup) {
      arrowsGroup.appendChild(path);
    } else {
      arrowsSvg.appendChild(path);
    }

    const edgeLabel = getGraphEdgeLabel(edge);
    if (edgeLabel) {
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('class', 'graph-edge-label');
      text.setAttribute('x', String(geometry.labelX));
      text.setAttribute('y', String(geometry.labelY - 5));
      text.setAttribute('text-anchor', 'middle');
      text.textContent = edgeLabel;
      if (arrowsGroup) {
        arrowsGroup.appendChild(text);
      } else {
        arrowsSvg.appendChild(text);
      }
    }
  }
}

// Live recalculation of all connection arrows
function renderArrows() {
  if (arrowsGroup) {
    arrowsGroup.innerHTML = '';
  } else {
    const paths = arrowsSvg.querySelectorAll(':scope > path');
    paths.forEach((p) => p.remove());
  }

  if (!currentSnapshot) return;
  if (isGraphSnapshot(currentSnapshot)) {
    renderGraphArrows(currentSnapshot);
    return;
  }
  if (!currentSnapshot.hasHead || currentSnapshot.structureType === 'array') return;

  // 1. Arrows from Pointer Badges (head, first, second, third, etc.)
  for (const ptr of currentSnapshot.pointers || []) {
    const badgeId = `badge-ptr-${ptr.name}`;
    const badgePos = nodePositions.get(badgeId);
    if (!badgePos) continue;

    if (ptr.targetNodeId && nodePositions.has(ptr.targetNodeId)) {
      const targetPos = nodePositions.get(ptr.targetNodeId)!;
      const centerA = { x: badgePos.x + badgePos.width / 2, y: badgePos.y + badgePos.height / 2 };
      const centerB = { x: targetPos.x + targetPos.width / 2, y: targetPos.y + targetPos.height / 2 };
      const start = getCapsulePerimeter(badgePos, centerB);
      const end =
        currentSnapshot.structureType === 'tree'
          ? getCirclePerimeterIntersection(centerB, targetPos.width / 2, centerA)
          : getPerimeterIntersection(targetPos, centerA);
      const isHead = ptr.name === 'head' || ptr.name === 'root';
      drawBezierArrow(
        start.x,
        start.y,
        start.nx,
        start.ny,
        end.x,
        end.y,
        end.nx,
        end.ny,
        false,
        isHead ? '#0066FF' : '#36C779'
      );
    } else if (ptr.isNull) {
      const nullId = `badge-null-${ptr.name}`;
      if (nodePositions.has(nullId)) {
        const nullPos = nodePositions.get(nullId)!;
        const centerA = { x: badgePos.x + badgePos.width / 2, y: badgePos.y + badgePos.height / 2 };
        const centerB = { x: nullPos.x + nullPos.width / 2, y: nullPos.y + nullPos.height / 2 };
        const start = getCapsulePerimeter(badgePos, centerB);
        const end = getPerimeterIntersection(nullPos, centerA);
        drawBezierArrow(
          start.x,
          start.y,
          start.nx,
          start.ny,
          end.x,
          end.y,
          end.nx,
          end.ny,
          true,
          '#737D8C'
        );
      }
    }
  }

  // 2. Tree branch arrows: node.leftId and node.rightId (connecting circular value cards)
  if (currentSnapshot.structureType === 'tree') {
    for (const node of currentSnapshot.nodes) {
      const nodePos = nodePositions.get(node.id);
      if (!nodePos) continue;

      const pCenter = { x: nodePos.x + nodePos.width / 2, y: nodePos.y + nodePos.height / 2 };
      const pRadius = nodePos.width / 2;

      // Left child arrow (curves downward to the left)
      if (node.leftId && nodePositions.has(node.leftId)) {
        const targetPos = nodePositions.get(node.leftId)!;
        const cCenter = { x: targetPos.x + targetPos.width / 2, y: targetPos.y + targetPos.height / 2 };
        const cRadius = targetPos.width / 2;
        const start = getCirclePerimeterIntersection(pCenter, pRadius, cCenter);
        const end = getCirclePerimeterIntersection(cCenter, cRadius, pCenter);

        drawBezierArrow(
          start.x,
          start.y,
          start.nx,
          start.ny,
          end.x,
          end.y,
          end.nx,
          end.ny,
          false,
          '#0066FF'
        );
      }

      // Right child arrow (curves downward to the right)
      if (node.rightId && nodePositions.has(node.rightId)) {
        const targetPos = nodePositions.get(node.rightId)!;
        const cCenter = { x: targetPos.x + targetPos.width / 2, y: targetPos.y + targetPos.height / 2 };
        const cRadius = targetPos.width / 2;
        const start = getCirclePerimeterIntersection(pCenter, pRadius, cCenter);
        const end = getCirclePerimeterIntersection(cCenter, cRadius, pCenter);

        drawBezierArrow(
          start.x,
          start.y,
          start.nx,
          start.ny,
          end.x,
          end.y,
          end.nx,
          end.ny,
          false,
          '#0066FF'
        );
      }
    }
    return;
  }

  // 3. Arrows between nodes: node.next -> targetNode or nullptr
  for (const node of currentSnapshot.nodes) {
    const nodePos = nodePositions.get(node.id);
    if (!nodePos) continue;

    // Node's next port coordinates: right edge of the 2-compartment card, vertically centered in NEXT cell
    const portX = nodePos.x + nodePos.width;
    const portY = nodePos.y + nodePos.height / 2;

    if (node.nextId && nodePositions.has(node.nextId)) {
      const targetPos = nodePositions.get(node.nextId)!;
      const targetCenter = { x: targetPos.x + targetPos.width / 2, y: targetPos.y + targetPos.height / 2 };
      const end = getPerimeterIntersection(targetPos, { x: portX, y: portY });

      const dx = targetCenter.x - portX;
      const dy = targetCenter.y - portY;
      const dist = Math.hypot(dx, dy) || 1;

      // When target is to the right, shoot cleanly horizontal (1, 0)
      const startNx = targetCenter.x >= portX - 10 ? 1 : dx / dist;
      const startNy = targetCenter.x >= portX - 10 ? 0 : dy / dist;

      drawBezierArrow(
        portX,
        portY,
        startNx,
        startNy,
        end.x,
        end.y,
        end.nx,
        end.ny,
        false,
        '#0066FF'
      );
    }

    // Node's prev port coordinates (Doubly Linked List): left edge of the card
    if (node.prevId && nodePositions.has(node.prevId)) {
      const prevPortX = nodePos.x;
      const prevPortY = nodePos.y + nodePos.height * 0.75;
      const prevTargetPos = nodePositions.get(node.prevId)!;
      const prevTargetCenter = { x: prevTargetPos.x + prevTargetPos.width / 2, y: prevTargetPos.y + prevTargetPos.height / 2 };
      const prevEnd = getPerimeterIntersection(prevTargetPos, { x: prevPortX, y: prevPortY });

      drawBezierArrow(
        prevPortX,
        prevPortY,
        -1,
        0.3,
        prevEnd.x,
        prevEnd.y,
        prevEnd.nx,
        prevEnd.ny,
        false,
        '#36C779'
      );
    } else if (nodePositions.has(`badge-null-${node.id}`)) {
      const nullPos = nodePositions.get(`badge-null-${node.id}`)!;
      const nullCenter = { x: nullPos.x + nullPos.width / 2, y: nullPos.y + nullPos.height / 2 };
      const end = getPerimeterIntersection(nullPos, { x: portX, y: portY });

      const dx = nullCenter.x - portX;
      const dy = nullCenter.y - portY;
      const dist = Math.hypot(dx, dy) || 1;

      const startNx = nullCenter.x >= portX - 10 ? 1 : dx / dist;
      const startNy = nullCenter.x >= portX - 10 ? 0 : dy / dist;

      drawBezierArrow(
        portX,
        portY,
        startNx,
        startNy,
        end.x,
        end.y,
        end.nx,
        end.ny,
        true,
        '#737D8C'
      );
    }
  }
}

/**
 * Enables smooth pointer-dragging on an array element cell card with an elastic spring
 * bounce-back to its original slot when the left click is released.
 * Cancels active CSS keyframe animations immediately so floating/highlighted elements
 * are 100% responsive and smoothly draggable anywhere on the canvas.
 */
function makeArrayElementDraggable(cellEl: HTMLElement, isElevated: boolean) {
  cellEl.onpointerdown = (e: PointerEvent) => {
    // Only left click (button 0) and not during spacebar camera panning
    if (e.button !== 0 || isSpacePressed) return;
    e.preventDefault();
    e.stopPropagation();

    // Kill any active CSS animations immediately so inline transform controls dragging
    cellEl.style.animation = 'none';
    (cellEl.style as any).webkitAnimation = 'none';
    cellEl.setPointerCapture(e.pointerId);
    cellEl.classList.add('dragging');
    cellEl.style.zIndex = '10000';
    cellEl.style.transition = 'none';

    const startX = e.clientX;
    const startY = e.clientY;
    const initialBaseY = isElevated ? -16 : 0;

    const onPointerMove = (moveEv: PointerEvent) => {
      moveEv.preventDefault();
      const dx = (moveEv.clientX - startX) / cameraZoom;
      const dy = (moveEv.clientY - startY) / cameraZoom;
      cellEl.style.transform = `translate(${dx}px, ${initialBaseY + dy}px) scale(1.12)`;
    };

    const onPointerUp = (upEv: PointerEvent) => {
      try {
        cellEl.releasePointerCapture(upEv.pointerId);
      } catch {}

      cellEl.classList.remove('dragging');
      // Satisfying physical spring overshoot bounce-back
      cellEl.style.transition = 'transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.3s ease';
      cellEl.style.transform = isElevated ? 'translate(0px, -16px) scale(1.06)' : 'translate(0px, 0px) scale(1)';

      setTimeout(() => {
        if (!cellEl.classList.contains('dragging')) {
          cellEl.style.zIndex = isElevated ? '20' : '';
          cellEl.style.transition = '';
          if (isElevated) {
            cellEl.style.transform = 'translateY(-16px) scale(1.06)';
          } else {
            cellEl.style.transform = '';
          }
        }
      }, 550);

      cellEl.removeEventListener('pointermove', onPointerMove);
      cellEl.removeEventListener('pointerup', onPointerUp);
      cellEl.removeEventListener('pointercancel', onPointerUp);
    };

    cellEl.addEventListener('pointermove', onPointerMove);
    cellEl.addEventListener('pointerup', onPointerUp);
    cellEl.addEventListener('pointercancel', onPointerUp);
  };
}

// Render Array Structure (deterministic row layout with floating pointer badges)
function renderArrayDiagram(snapshot: LinkedListSnapshot, previousSnapshot?: LinkedListSnapshot | null) {
  if (simulation) {
    simulation.stop();
    simulation.nodes([]);
  }
  const paths = arrowsSvg.querySelectorAll('path');
  paths.forEach((p) => p.remove());

  const arrays = snapshot.arrays || [];
  const indexPointers = snapshot.indexPointers || [];

  if (arrays.length === 0) {
    const emptyMsg = document.createElement('div');
    emptyMsg.className = 'empty-canvas-message';
    emptyMsg.innerHTML = `
      <div class="empty-icon">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#737D8C" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line>
        </svg>
      </div>
      <div class="empty-title">Array Initializing</div>
      <div class="empty-subtitle">Program paused at entry.<br>Click <b>Next</b> to allocate and initialize the array.</div>
    `;
    nodesLayer.appendChild(emptyMsg);
    return;
  }

  const container = document.createElement('div');
  container.className = 'array-board-container';

  for (const arrVar of arrays) {
    const board = document.createElement('div');
    board.className = 'array-board';

    // Minimalist clean array name label (e.g. • itemId)
    const nameLabel = document.createElement('div');
    nameLabel.className = 'array-name-simple';
    nameLabel.textContent = arrVar.name;
    board.appendChild(nameLabel);

    // VisuAlgo Two-Pointer Range (e.g. left and right, low and high, start and end)
    const leftPtr = indexPointers.find(
      (p) =>
        ['left', 'low', 'start'].includes(p.name.toLowerCase()) &&
        (!p.targetArrayName || p.targetArrayName === arrVar.name)
    );
    const rightPtr = indexPointers.find(
      (p) =>
        ['right', 'high', 'end'].includes(p.name.toLowerCase()) &&
        (!p.targetArrayName || p.targetArrayName === arrVar.name)
    );
    const hasSearchWindow =
      leftPtr !== undefined &&
      rightPtr !== undefined &&
      leftPtr.targetIndex <= rightPtr.targetIndex;

    // Detect if two elements were swapped between previousSnapshot and current arrVar (e.g. Bubble Sort)
    let swappedPair: { idxA: number; idxB: number } | null = null;
    const prevArr = previousSnapshot?.arrays?.find((a) => a.name === arrVar.name);
    if (prevArr && prevArr.elements.length === arrVar.elements.length) {
      const changedIndices: number[] = [];
      for (let k = 0; k < arrVar.elements.length; k++) {
        if (prevArr.elements[k] && prevArr.elements[k].value !== arrVar.elements[k].value) {
          changedIndices.push(k);
        }
      }
      if (changedIndices.length === 2) {
        const [a, b] = changedIndices;
        if (
          prevArr.elements[a].value === arrVar.elements[b].value &&
          prevArr.elements[b].value === arrVar.elements[a].value
        ) {
          swappedPair = { idxA: a, idxB: b };
        }
      }
    }

    // Calculate max numeric value for magnitude bar (VisuAlgo visual encoding)
    const numericVals = arrVar.elements
      .filter((e) => !e.isCapacitySlot && typeof e.value === 'number')
      .map((e) => Math.abs(e.value as number));
    const maxVal = numericVals.length > 0 ? Math.max(...numericVals, 1) : 1;

    // Strip Wrapper
    const stripWrapper = document.createElement('div');
    stripWrapper.className = 'array-strip-wrapper';

    const strip = document.createElement('div');
    strip.className = 'array-strip';

    // Elements
    for (const elem of arrVar.elements) {
      const col = document.createElement('div');
      col.className = 'array-column';

      // Index Pointer Badges pointing to this cell
      const matchingPointers = indexPointers.filter(
        (ptr) =>
          ptr.targetIndex === elem.index &&
          (!ptr.targetArrayName || ptr.targetArrayName === arrVar.name)
      );

      const isElevated: boolean = Boolean(elem.isActive || elem.isModified || matchingPointers.length > 0);

      // Check previous elevation to trigger a single bounce on highlight or de-highlight transition
      let wasElevated = false;
      if (previousSnapshot) {
        const prevArr = previousSnapshot.arrays?.find((a) => a.name === arrVar.name);
        const prevElem = prevArr?.elements.find((e) => e.index === elem.index);
        const prevMatchingPointers = (previousSnapshot.indexPointers || []).filter(
          (ptr) =>
            ptr.targetIndex === elem.index &&
            (!ptr.targetArrayName || ptr.targetArrayName === arrVar.name)
        );
        wasElevated = Boolean(
          prevElem?.isActive || prevElem?.isModified || prevMatchingPointers.length > 0
        );
      }

      if (matchingPointers.length > 0) {
        col.classList.add('has-active-pointer');
        const ptrContainer = document.createElement('div');
        ptrContainer.className = 'array-pointer-container';

        for (const ptr of matchingPointers) {
          const ptrPill = document.createElement('div');
          const cleanName = ptr.name.toLowerCase().replace(/[^a-z0-9]/g, '');
          ptrPill.className = `array-pointer-pill ptr-${cleanName}`;
          ptrPill.innerHTML = `<span>${ptr.name}</span><span class="ptr-arrow">↓</span>`;
          ptrContainer.appendChild(ptrPill);
        }
        col.appendChild(ptrContainer);
      }

      // Cell
      const cell = document.createElement('div');
      cell.className = 'array-cell';
      if (elem.isCapacitySlot) {
        cell.classList.add('capacity-slot');
      }
      if (elem.isModified) {
        cell.classList.add('modified');
      }
      if (elem.isActive) {
        cell.classList.add('active');
      }
      if (isElevated) {
        cell.classList.add('cell-thrust');
        col.classList.add('has-thrust');
      }

      // One-time bounce animation only at the exact moment of highlight or de-highlight
      if (previousSnapshot) {
        if (!wasElevated && isElevated) {
          cell.classList.add('cell-bounce-in');
        } else if (wasElevated && !isElevated) {
          cell.classList.add('cell-bounce-out');
        }
      }

      // Bubble sort arc hop swap animations
      if (swappedPair) {
        const offsetPx = (swappedPair.idxB - swappedPair.idxA) * 76;
        cell.style.setProperty('--swap-offset', `${offsetPx}px`);
        if (elem.index === swappedPair.idxA) {
          cell.classList.add('cell-swapped-left');
        } else if (elem.index === swappedPair.idxB) {
          cell.classList.add('cell-swapped-right');
        }
      }

      // Make cell draggable with bouncy spring release
      makeArrayElementDraggable(cell, isElevated);

      // VisuAlgo Search Window Range Highlighting
      if (hasSearchWindow && !elem.isCapacitySlot) {
        if (elem.index >= leftPtr!.targetIndex && elem.index <= rightPtr!.targetIndex) {
          cell.classList.add('in-range');
        } else {
          cell.classList.add('out-of-range');
        }
      }

      // Magnitude fill bar (VisuAlgo style)
      if (!elem.isCapacitySlot && typeof elem.value === 'number' && elem.value > 0) {
        const barHeight = Math.min(100, Math.max(12, Math.round((elem.value / maxVal) * 100)));
        const bar = document.createElement('div');
        bar.className = 'array-cell-bar';
        bar.style.height = `${barHeight}%`;
        cell.appendChild(bar);
      }

      // Index label
      const indexSpan = document.createElement('span');
      indexSpan.className = 'array-cell-index';
      indexSpan.textContent = `[${elem.index}]`;

      // Value
      const valSpan = document.createElement('span');
      valSpan.className = 'array-cell-val';
      valSpan.textContent = String(elem.value);

      cell.appendChild(indexSpan);
      cell.appendChild(valSpan);

      col.appendChild(cell);
      strip.appendChild(col);
    }

    stripWrapper.appendChild(strip);
    board.appendChild(stripWrapper);
    container.appendChild(board);
  }

  nodesLayer.appendChild(container);
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderStringDiagram(snapshot: LinkedListSnapshot, previousSnapshot?: LinkedListSnapshot | null) {
  if (simulation) {
    simulation.stop();
    simulation.nodes([]);
  }
  const paths = arrowsSvg.querySelectorAll('path');
  paths.forEach((p) => p.remove());

  const strings = snapshot.strings || [];
  const indexPointers = snapshot.indexPointers || [];
  const stringWindows = snapshot.stringWindows || [];

  if (strings.length === 0) {
    const emptyMsg = document.createElement('div');
    emptyMsg.className = 'empty-canvas-message';
    emptyMsg.innerHTML = `
      <div class="empty-icon">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#737D8C" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line>
        </svg>
      </div>
      <div class="empty-title">String Initializing</div>
      <div class="empty-subtitle">Program paused at entry.<br>Click <b>Next</b> to allocate and initialize the string.</div>
    `;
    nodesLayer.appendChild(emptyMsg);
    return;
  }

  const container = document.createElement('div');
  container.className = 'string-board-container';

  for (const strVar of strings) {
    const board = document.createElement('div');
    board.className = 'string-board';

    // Variable Label & Meta Badge: • s (std::string, length: 7)
    const nameLabel = document.createElement('div');
    nameLabel.className = 'string-name-simple';
    const typeLabel =
      strVar.type === 'std_string'
        ? 'std::string'
        : strVar.type === 'char_array'
        ? `char[${strVar.capacity || strVar.length + 1}]`
        : 'char*';
    nameLabel.innerHTML = `<span class="string-var-name">${escapeHtml(strVar.name)}</span> <span class="string-meta-tag">${typeLabel}, length: ${strVar.length}</span>`;
    board.appendChild(nameLabel);

    // Detect if two characters were swapped between previousSnapshot and current strVar
    let swappedPair: { idxA: number; idxB: number } | null = null;
    const prevStr = previousSnapshot?.strings?.find((s) => s.name === strVar.name);
    if (prevStr && prevStr.elements.length === strVar.elements.length) {
      const changedIndices: number[] = [];
      for (let k = 0; k < strVar.elements.length; k++) {
        if (prevStr.elements[k] && prevStr.elements[k].char !== strVar.elements[k].char) {
          changedIndices.push(k);
        }
      }
      if (changedIndices.length === 2) {
        const [a, b] = changedIndices;
        if (
          prevStr.elements[a].char === strVar.elements[b].char &&
          prevStr.elements[b].char === strVar.elements[a].char
        ) {
          swappedPair = { idxA: a, idxB: b };
        }
      }
    }

    // Active sliding window for this string
    const activeWindow = stringWindows.find((w) => !w.stringName || w.stringName === strVar.name);

    // Strip Wrapper
    const stripWrapper = document.createElement('div');
    stripWrapper.className = 'string-strip-wrapper';

    const strip = document.createElement('div');
    strip.className = 'string-strip';

    // Build Character Columns
    for (const elem of strVar.elements) {
      const col = document.createElement('div');
      col.className = 'string-column';

      // Index Pointer Badges pointing to this cell (e.g. left, right, i, j)
      const matchingPointers = indexPointers.filter(
        (ptr) =>
          ptr.targetIndex === elem.index &&
          (!ptr.targetArrayName || ptr.targetArrayName === strVar.name)
      );

      if (matchingPointers.length > 0) {
        col.classList.add('has-active-pointer');
        const ptrContainer = document.createElement('div');
        ptrContainer.className = 'string-pointer-container';

        for (const ptr of matchingPointers) {
          const ptrPill = document.createElement('div');
          const cleanName = ptr.name.toLowerCase().replace(/[^a-z0-9]/g, '');
          ptrPill.className = `string-pointer-pill ptr-${cleanName}`;
          ptrPill.innerHTML = `<span>${escapeHtml(ptr.name)}</span><span class="ptr-arrow">↓</span>`;
          ptrContainer.appendChild(ptrPill);
        }
        col.appendChild(ptrContainer);
      }

      // Character Cell
      const cell = document.createElement('div');
      cell.className = 'string-cell';
      cell.id = `string-${strVar.name}-${elem.index}`;

      if (elem.isNullTerminator) {
        cell.classList.add('string-null-cell');
      }

      if (elem.isModified) {
        cell.classList.add('modified');
      }

      if (elem.isCompared) {
        cell.classList.add('compared');
      }

      if (matchingPointers.length > 0 || elem.isActive) {
        cell.classList.add('active');
      }

      // Sliding Window styling
      if (
        elem.isWindow ||
        (activeWindow && elem.index >= activeWindow.startIndex && elem.index <= activeWindow.endIndex)
      ) {
        cell.classList.add('in-window');
      }

      // Swapped animation
      if (swappedPair) {
        if (elem.index === swappedPair.idxA) {
          cell.classList.add('cell-swapped-left');
        } else if (elem.index === swappedPair.idxB) {
          cell.classList.add('cell-swapped-right');
        }
      }

      // Character Glyph
      const glyphSpan = document.createElement('span');
      glyphSpan.className = 'string-cell-char';
      glyphSpan.textContent = elem.isNullTerminator ? '\\0' : elem.char === ' ' ? '␣' : elem.char;

      // ASCII Subscript Code
      const asciiSpan = document.createElement('span');
      asciiSpan.className = 'string-cell-ascii';
      asciiSpan.textContent = String(elem.ascii);

      // Index label
      const indexSpan = document.createElement('span');
      indexSpan.className = 'string-cell-index';
      indexSpan.textContent = `[${elem.index}]`;

      cell.appendChild(glyphSpan);
      cell.appendChild(asciiSpan);
      cell.appendChild(indexSpan);

      col.appendChild(cell);
      strip.appendChild(col);
    }

    stripWrapper.appendChild(strip);

    // Sliding Window Bracket / Tag if active
    if (activeWindow && activeWindow.startIndex <= activeWindow.endIndex) {
      const windowBar = document.createElement('div');
      windowBar.className = 'string-window-bracket-container';
      const subStr = strVar.elements
        .slice(activeWindow.startIndex, activeWindow.endIndex + 1)
        .filter((e) => !e.isNullTerminator)
        .map((e) => e.char)
        .join('');
      windowBar.innerHTML = `
        <div class="string-window-indicator">
          <span class="window-bracket-symbol">⟦</span>
          <span class="window-bracket-label">${escapeHtml(activeWindow.label || 'Window')} [${activeWindow.startIndex}..${activeWindow.endIndex}]: "${escapeHtml(subStr)}"</span>
          <span class="window-bracket-symbol">⟧</span>
        </div>
      `;
      stripWrapper.appendChild(windowBar);
    }

    board.appendChild(stripWrapper);
    container.appendChild(board);
  }

  nodesLayer.appendChild(container);
}

/**
 * Enables smooth pointer-dragging on a stack element card with an elastic spring
 * bounce-back to its slot inside the stack container when released.
 */
function makeStackElementDraggable(blockEl: HTMLElement, isTop: boolean) {
  blockEl.onpointerdown = (e: PointerEvent) => {
    if (e.button !== 0 || isSpacePressed) return;
    e.preventDefault();
    e.stopPropagation();

    blockEl.style.animation = 'none';
    (blockEl.style as any).webkitAnimation = 'none';
    blockEl.setPointerCapture(e.pointerId);
    blockEl.classList.add('dragging');
    blockEl.style.zIndex = '1000';
    blockEl.style.transition = 'none';

    const startX = e.clientX;
    const startY = e.clientY;

    const onPointerMove = (moveEv: PointerEvent) => {
      moveEv.preventDefault();
      const dx = (moveEv.clientX - startX) / cameraZoom;
      const dy = (moveEv.clientY - startY) / cameraZoom;
      blockEl.style.transform = `translate(${dx}px, ${dy}px) scale(1.05)`;
    };

    const onPointerUp = (upEv: PointerEvent) => {
      try {
        blockEl.releasePointerCapture(upEv.pointerId);
      } catch {}

      blockEl.classList.remove('dragging');
      blockEl.style.transition = 'transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.3s ease';
      blockEl.style.transform = 'translate(0px, 0px) scale(1)';

      setTimeout(() => {
        if (!blockEl.classList.contains('dragging')) {
          blockEl.style.zIndex = '';
          blockEl.style.transition = '';
          blockEl.style.transform = '';
        }
      }, 550);

      blockEl.removeEventListener('pointermove', onPointerMove);
      blockEl.removeEventListener('pointerup', onPointerUp);
      blockEl.removeEventListener('pointercancel', onPointerUp);
    };

    blockEl.addEventListener('pointermove', onPointerMove);
    blockEl.addEventListener('pointerup', onPointerUp);
    blockEl.addEventListener('pointercancel', onPointerUp);
  };
}

// Render Stack in Debugger Canvas (Vertical bottom-to-top beaker/well view with floating TOP badge)
function renderDebuggerStackDiagram(
  snapshot: LinkedListSnapshot,
  previousSnapshot?: LinkedListSnapshot | null
) {
  if (simulation) {
    simulation.stop();
    simulation.nodes([]);
  }
  const paths = arrowsSvg.querySelectorAll('path');
  paths.forEach((p) => p.remove());

  const stack = snapshot.stack;
  if (!stack) {
    const emptyMsg = document.createElement('div');
    emptyMsg.className = 'empty-canvas-message';
    emptyMsg.innerHTML = `
      <div class="empty-icon">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#737D8C" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line>
        </svg>
      </div>
      <div class="empty-title">Stack Initializing</div>
      <div class="empty-subtitle">Program paused at entry.<br>Click <b>Next</b> to execute stack instructions.</div>
    `;
    nodesLayer.appendChild(emptyMsg);
    return;
  }

  const container = document.createElement('div');
  container.className = 'stack-board-container';

  // 1. Header bar with variable name, LIFO badge, size, and method status
  const headerBar = document.createElement('div');
  headerBar.className = 'stack-header-bar';

  const titleTag = document.createElement('div');
  titleTag.className = 'stack-title-tag';
  titleTag.innerHTML = `
    <span class="stack-icon-symbol">☷</span>
    <span class="stack-var-name">${stack.name}</span>
    <span class="stack-badge-lifo">STACK (LIFO)</span>
  `;
  headerBar.appendChild(titleTag);

  const metaChips = document.createElement('div');
  metaChips.className = 'stack-meta-chips';

  const sizeChip = document.createElement('span');
  sizeChip.className = 'stack-meta-chip';
  const currentCount = Math.max(0, stack.topIndex + 1);
  sizeChip.innerHTML = `Size: <strong>${currentCount} / ${stack.capacity}</strong>`;
  metaChips.appendChild(sizeChip);

  if (stack.activeMethod) {
    const methodChip = document.createElement('span');
    methodChip.className = `stack-method-chip ${stack.activeMethod}`;
    if (stack.activeMethod === 'push') {
      const pVal = stack.methodParam !== undefined ? stack.methodParam : '';
      methodChip.textContent = `PUSH(${pVal})`;
    } else if (stack.activeMethod === 'pop') {
      const ret = stack.methodReturnValue !== undefined ? ` → ${stack.methodReturnValue}` : '';
      methodChip.textContent = `POP()${ret}`;
    } else if (stack.activeMethod === 'peek') {
      methodChip.textContent = `PEEK()`;
    }
    metaChips.appendChild(methodChip);
  }

  if (stack.isOverflow) {
    const overflowChip = document.createElement('span');
    overflowChip.className = 'stack-method-chip overflow';
    overflowChip.textContent = 'OVERFLOW';
    metaChips.appendChild(overflowChip);
  }

  if (stack.isUnderflow) {
    const underflowChip = document.createElement('span');
    underflowChip.className = 'stack-method-chip underflow';
    underflowChip.textContent = 'UNDERFLOW';
    metaChips.appendChild(underflowChip);
  }

  headerBar.appendChild(metaChips);
  container.appendChild(headerBar);

  // 2. Stage: Indices Column + Bucket Container + Pointers Column
  const stage = document.createElement('div');
  stage.className = 'stack-visual-stage';

  // Compute responsive slot height
  const slotHeight = stack.capacity > 8 ? Math.max(26, Math.floor(260 / stack.capacity)) : 42;
  const slotGap = stack.capacity > 8 ? 4 : 6;
  stage.style.setProperty('--slot-height', `${slotHeight}px`);
  stage.style.setProperty('--slot-gap', `${slotGap}px`);

  // Left column: index labels [0], [1], ... [capacity - 1]
  const indicesCol = document.createElement('div');
  indicesCol.className = 'stack-indices-column';

  // Center column wrapper: Rim indicator + Bucket + Base plate
  const bucketWrapper = document.createElement('div');
  bucketWrapper.className = 'stack-bucket-wrapper';

  const rimIndicator = document.createElement('div');
  rimIndicator.className = 'stack-rim-indicator';
  rimIndicator.innerHTML = `
    <span class="stack-rim-text">OPEN TOP</span>
    <span class="stack-rim-arrow">↓ PUSH &nbsp;|&nbsp; POP ↑</span>
  `;
  bucketWrapper.appendChild(rimIndicator);

  const bucket = document.createElement('div');
  bucket.className = 'stack-bucket';

  // Right column: TOP pointer indicators
  const pointersCol = document.createElement('div');
  pointersCol.className = 'stack-pointers-column';

  // Render rows from 0 to capacity - 1
  // With flex-direction: column-reverse, index 0 appears at the bottom!
  for (let i = 0; i < stack.capacity; i++) {
    const elem = stack.elements.find((e) => e.index === i);
    const isTop = i === stack.topIndex && stack.topIndex >= 0;
    const isOccupied = elem !== undefined && elem.value !== null && elem.value !== undefined && i <= stack.topIndex;

    // A. Left column: Index label
    const idxLabel = document.createElement('div');
    idxLabel.className = 'stack-index-label';
    if (isTop) idxLabel.classList.add('is-top-index');
    idxLabel.textContent = `[${i}]`;
    indicesCol.appendChild(idxLabel);

    // B. Center column: Element Block inside Bucket
    const block = document.createElement('div');
    block.className = 'stack-element-block';

    if (isOccupied) {
      block.classList.add('occupied');
      if (isTop) {
        block.classList.add('is-top');
      }
      if (elem?.isPushing || (isTop && stack.activeMethod === 'push')) {
        block.classList.add('is-pushing');
      }
      if (isTop && stack.activeMethod === 'peek') {
        block.classList.add('is-peeked');
      }

      // Small index subscript
      const sub = document.createElement('span');
      sub.className = 'stack-elem-subscript';
      sub.textContent = `[${i}]`;

      // Value text
      const val = document.createElement('span');
      val.className = 'stack-elem-value';
      val.textContent = String(elem.value);

      // Spacer on right for visual balance
      const rightSpacer = document.createElement('span');
      rightSpacer.className = 'stack-elem-subscript';
      rightSpacer.style.opacity = '0';
      rightSpacer.textContent = `[${i}]`;

      block.appendChild(sub);
      block.appendChild(val);
      block.appendChild(rightSpacer);

      makeStackElementDraggable(block, isTop);
    } else {
      block.classList.add('capacity-slot');

      const sub = document.createElement('span');
      sub.className = 'stack-elem-subscript';
      sub.textContent = `[${i}]`;

      const emptyText = document.createElement('span');
      emptyText.className = 'stack-elem-val-empty';
      emptyText.textContent = '—';

      const rightSpacer = document.createElement('span');
      rightSpacer.className = 'stack-elem-subscript';
      rightSpacer.style.opacity = '0';
      rightSpacer.textContent = `[${i}]`;

      block.appendChild(sub);
      block.appendChild(emptyText);
      block.appendChild(rightSpacer);
    }

    bucket.appendChild(block);

    // C. Right column: Pointer Pill or Spacer
    const ptrCell = document.createElement('div');
    ptrCell.className = 'stack-pointer-spacer';

    if (isTop) {
      const topPill = document.createElement('div');
      topPill.className = 'stack-top-pointer-pill';
      topPill.innerHTML = `<span class="stack-pointer-arrow">◀</span><span>TOP</span>`;
      ptrCell.appendChild(topPill);
    }

    pointersCol.appendChild(ptrCell);
  }

  bucketWrapper.appendChild(bucket);

  // Sturdy base foot underneath the bucket
  const baseStand = document.createElement('div');
  baseStand.className = 'stack-base-stand';
  bucketWrapper.appendChild(baseStand);

  const baseText = document.createElement('div');
  baseText.className = 'stack-base-text';
  baseText.textContent = 'STACK BASE [0]';
  bucketWrapper.appendChild(baseText);

  // If stack is completely empty (topIndex == -1), show indicator at the base level
  if (stack.topIndex === -1) {
    const emptyTopPill = document.createElement('div');
    emptyTopPill.className = 'stack-top-pointer-pill is-empty';
    emptyTopPill.innerHTML = `<span class="stack-pointer-arrow">◀</span><span>TOP = -1</span>`;
    emptyTopPill.style.position = 'absolute';
    emptyTopPill.style.bottom = '18px';
    pointersCol.style.position = 'relative';
    pointersCol.appendChild(emptyTopPill);
  }

  stage.appendChild(indicesCol);
  stage.appendChild(bucketWrapper);
  stage.appendChild(pointersCol);

  container.appendChild(stage);
  nodesLayer.appendChild(container);
}

// Render Queue in Debugger Canvas (deterministic horizontal array layout with floating FRONT and REAR badges)
function renderDebuggerQueueDiagram(
  snapshot: LinkedListSnapshot,
  previousSnapshot?: LinkedListSnapshot | null
) {
  if (simulation) {
    simulation.stop();
    simulation.nodes([]);
  }
  const paths = arrowsSvg.querySelectorAll('path');
  paths.forEach((p) => p.remove());

  const queue = snapshot.queue;
  if (!queue) {
    const emptyMsg = document.createElement('div');
    emptyMsg.className = 'empty-canvas-message';
    emptyMsg.innerHTML = `
      <div class="empty-icon">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#737D8C" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line>
        </svg>
      </div>
      <div class="empty-title">Queue Initializing</div>
      <div class="empty-subtitle">Program paused at entry.<br>Click <b>Next</b> to execute queue instructions.</div>
    `;
    nodesLayer.appendChild(emptyMsg);
    return;
  }

  const container = document.createElement('div');
  container.className = 'array-board-container';

  const board = document.createElement('div');
  board.className = 'array-board';

  // Horizontal strip wrapper
  const stripWrapper = document.createElement('div');
  stripWrapper.className = 'array-strip-wrapper';

  const strip = document.createElement('div');
  strip.className = 'array-strip';

  for (let i = 0; i < queue.capacity; i++) {
    const slot = queue.slots[i] || { index: i, value: null, hasValue: false };
    const col = document.createElement('div');
    col.className = 'array-column';

    // Queue pointers display whenever front/rear point to valid indices
    const isFront = queue.front >= 0 && i === queue.front;
    const isRear = queue.rear >= 0 && i === queue.rear;
    const hasPointers = isFront || isRear;
    const isOccupied = slot.hasValue && slot.value !== null && slot.value !== undefined;
    const isElevated = isOccupied && (slot.isHighlighted || slot.isEnqueuing || hasPointers);

    // Check previous queue state to trigger a one-shot bounce on highlight / de-highlight
    let wasElevated = false;
    if (previousSnapshot?.queue) {
      const prevQ = previousSnapshot.queue;
      const prevSlot = prevQ.slots[i] || { index: i, value: null, hasValue: false };
      const prevIsFront = prevQ.front >= 0 && i === prevQ.front;
      const prevIsRear = prevQ.rear >= 0 && i === prevQ.rear;
      const prevHasPointers = prevIsFront || prevIsRear;
      const prevOccupied = prevSlot.hasValue && prevSlot.value !== null && prevSlot.value !== undefined;
      wasElevated = prevOccupied && (prevSlot.isHighlighted || prevSlot.isEnqueuing || prevHasPointers);
    }

    // Index Pointer Badges pointing to this cell
    if (hasPointers) {
      col.classList.add('has-active-pointer');
      const ptrContainer = document.createElement('div');
      ptrContainer.className = 'array-pointer-container';

      if (isFront) {
        const frontPill = document.createElement('div');
        frontPill.className = 'array-pointer-pill ptr-front';
        frontPill.innerHTML = `<span>FRONT</span><span class="ptr-arrow">↓</span>`;
        ptrContainer.appendChild(frontPill);
      }
      if (isRear) {
        const rearPill = document.createElement('div');
        rearPill.className = 'array-pointer-pill ptr-rear';
        rearPill.innerHTML = `<span>REAR</span><span class="ptr-arrow">↓</span>`;
        ptrContainer.appendChild(rearPill);
      }
      col.appendChild(ptrContainer);
    }

    // Cell
    const cell = document.createElement('div');
    cell.className = 'array-cell';

    if (!isOccupied) {
      cell.classList.add('capacity-slot');
    }
    if (slot.isHighlighted || slot.isEnqueuing) {
      cell.classList.add('active');
    }
    if (isElevated) {
      cell.classList.add('cell-thrust');
      col.classList.add('has-thrust');
    }

    // One-time bounce animation only at the exact moment of highlight or de-highlight
    if (previousSnapshot) {
      if (!wasElevated && isElevated) {
        cell.classList.add('cell-bounce-in');
      } else if (wasElevated && !isElevated) {
        cell.classList.add('cell-bounce-out');
      }
    }

    // Interactive spring draggable: pulls and snaps back
    makeArrayElementDraggable(cell, isElevated);

    // Index label [0]
    const indexSpan = document.createElement('span');
    indexSpan.className = 'array-cell-index';
    indexSpan.textContent = `[${i}]`;

    // Value label
    const valSpan = document.createElement('span');
    valSpan.className = 'array-cell-val';
    valSpan.textContent = isOccupied ? String(slot.value) : '—';

    cell.appendChild(indexSpan);
    cell.appendChild(valSpan);

    col.appendChild(cell);
    strip.appendChild(col);
  }

  stripWrapper.appendChild(strip);
  board.appendChild(stripWrapper);
  container.appendChild(board);
  nodesLayer.appendChild(container);
}

// Render the interactive graph with physics and dynamic arrows
function renderGraphDiagram(snapshot: GraphSnapshot, resetPositions: boolean = false) {
  if (cardTitle) cardTitle.textContent = 'GRAPH';
  if (canvasHint) canvasHint.textContent = 'Drag nodes to move • Right-click drag to pan • Scroll to zoom';
  const enteringGraph = !currentSnapshot || !isGraphSnapshot(currentSnapshot);
  const previousGraph =
    currentSnapshot && isGraphSnapshot(currentSnapshot) ? currentSnapshot.graph : undefined;
  if (
    enteringGraph ||
    resetPositions ||
    hasNewGraphVertices(previousGraph, snapshot.graph)
  ) {
    graphFitPending = true;
  }
  currentSnapshot = snapshot;
  canvasTitle.textContent = 'Graph';
  nodesLayer.innerHTML = '';
  d3Links = [];
  const activeIds = new Set<string>();

  if (resetPositions) {
    nodePositions.clear();
    d3NodesMap.clear();
  }

  const vertices = snapshot.graph.vertices;
  if (vertices.length === 0) {
    nodePositions.clear();
    d3NodesMap.clear();
    clearSimulation();
    graphFitPending = true;
    const emptyMessage = document.createElement('div');
    emptyMessage.className = 'empty-canvas-message';
    emptyMessage.textContent = 'This graph has no vertices.';
    nodesLayer.appendChild(emptyMessage);
    renderArrows();
    return;
  }

  const columns = Math.ceil(Math.sqrt(vertices.length));
  const spacingX = 132;
  const spacingY = 112;
  const centerX = graphCanvas.clientWidth / 2;
  const centerY = graphCanvas.clientHeight / 2;

  vertices.forEach((vertex, index) => {
    activeIds.add(vertex.id);
    const nodeEl = document.createElement('div');
    nodeEl.id = `node-${vertex.id}`;
    nodeEl.className = 'graph-vertex-card';
    if (vertex.isVisiting || snapshot.activeVertexId === vertex.id) {
      nodeEl.classList.add('visiting');
    }
    if (vertex.isNewlyCreated) nodeEl.classList.add('new-created');
    if (vertex.isDetached) nodeEl.classList.add('detached');

    const value = document.createElement('span');
    value.className = 'graph-vertex-value';
    value.textContent = String(vertex.value);
    nodeEl.appendChild(value);
    nodeEl.title = `Vertex ${vertex.id}: ${String(vertex.value)}`;
    nodesLayer.appendChild(nodeEl);

    const column = index % columns;
    const row = Math.floor(index / columns);
    const rowSize = Math.min(columns, vertices.length - row * columns);
    const targetCenterX = centerX + (column - (rowSize - 1) / 2) * spacingX;
    const rowCount = Math.ceil(vertices.length / columns);
    const targetCenterY = centerY + (row - (rowCount - 1) / 2) * spacingY;
    registerD3Node(
      vertex.id,
      nodeEl,
      targetCenterX,
      targetCenterY,
      76,
      54,
      'node',
      resetPositions
    );
    makeDraggable(nodeEl, vertex.id);
  });

  for (const [bodyId] of d3NodesMap.entries()) {
    if (!activeIds.has(bodyId)) {
      d3NodesMap.delete(bodyId);
      nodePositions.delete(bodyId);
    }
  }

  d3Links = prepareGraphLayoutLinks(snapshot.graph).map((link) => ({ ...link }));
  initOrUpdateSimulation(
    Array.from(d3NodesMap.values()),
    d3Links,
    resetPositions
  );
}

function renderLinkedListDiagram(snapshot: LinkedListSnapshot, resetPositions: boolean = false) {
  const previousSnapshot = currentSnapshot && !isGraphSnapshot(currentSnapshot) ? currentSnapshot : null;
  if (currentSnapshot && isGraphSnapshot(currentSnapshot)) {
    resetCameraView(false);
  }
  currentSnapshot = snapshot;
  if (canvasTitle) {
    if (snapshot.structureType === 'string') {
      canvasTitle.textContent = 'String';
    } else if (snapshot.structureType === 'array') {
      canvasTitle.textContent = 'Array';
    } else if (snapshot.structureType === 'tree') {
      canvasTitle.textContent = 'Binary Tree';
    } else if (snapshot.structureType === 'stack') {
      canvasTitle.textContent = 'Stack (LIFO)';
    } else if (snapshot.structureType === 'queue') {
      canvasTitle.textContent = 'Circular Queue (FIFO)';
    } else {
      canvasTitle.textContent = 'Linked List';
    }
  }
  nodesLayer.innerHTML = '';
  d3Links = [];
  const activeIds = new Set<string>();

  if (cardTitle) {
    if (isCreativeMode) {
      if (snapshot.structureType === 'stack') {
        cardTitle.textContent = 'Creative Studio (STACK)';
      } else if (snapshot.structureType === 'queue') {
        cardTitle.textContent = 'Creative Studio (QUEUE)';
      } else {
        cardTitle.textContent = 'Creative Studio (LINKED LIST)';
      }
    } else {
      if (snapshot.structureType === 'string') {
        cardTitle.textContent = 'STRING';
      } else if (snapshot.structureType === 'array') {
        cardTitle.textContent = 'ARRAY';
      } else if (snapshot.structureType === 'tree') {
        cardTitle.textContent = 'BINARY TREE';
      } else if (snapshot.structureType === 'stack') {
        cardTitle.textContent = 'STACK (LIFO)';
      } else if (snapshot.structureType === 'queue') {
        cardTitle.textContent = 'CIRCULAR QUEUE (FIFO)';
      } else {
        cardTitle.textContent = 'LINKED LIST';
      }
    }
  }

  if (canvasHint) {
    if (snapshot.structureType === 'string') {
      canvasHint.textContent = 'Inspect string characters, ASCII codes, pointers and sliding windows';
    } else if (snapshot.structureType === 'array' || snapshot.structureType === 'stack' || snapshot.structureType === 'queue') {
      canvasHint.textContent = 'Drag elements freely to explore • Release to bounce back • Right-click drag to pan';
    } else {
      canvasHint.textContent = 'Drag nodes to move • Right-click drag to pan • Scroll to zoom';
    }
  }

  if (resetPositions) {
    nodePositions.clear();
    d3NodesMap.clear();
  }

  // Handle Stack Rendering
  if (snapshot.structureType === 'stack') {
    renderDebuggerStackDiagram(snapshot, previousSnapshot);
    return;
  }

  // Handle Queue Rendering
  if (snapshot.structureType === 'queue') {
    renderDebuggerQueueDiagram(snapshot, previousSnapshot);
    return;
  }

  // Handle Array Rendering
  if (snapshot.structureType === 'array') {
    renderArrayDiagram(snapshot, previousSnapshot);
    return;
  }

  // Handle String Rendering
  if (snapshot.structureType === 'string') {
    renderStringDiagram(snapshot, previousSnapshot);
    return;
  }

  const { headId, nodes } = snapshot;

  // 0. If head has not been declared/initialized yet (before line executes)
  if (!snapshot.hasHead) {
    nodePositions.clear();
    d3NodesMap.clear();
    d3Links = [];
    if (arrowsGroup) {
      arrowsGroup.innerHTML = '';
    } else {
      const paths = arrowsSvg.querySelectorAll(':scope > path');
      paths.forEach((p) => p.remove());
    }

    const dsName = (snapshot.structureType as string) === 'tree' ? 'tree' : 'linked list';
    const emptyMsg = document.createElement('div');
    emptyMsg.className = 'empty-canvas-message';
    emptyMsg.innerHTML = `
      <div class="empty-icon">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#737D8C" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line>
        </svg>
      </div>
      <div class="empty-title">Canvas Empty</div>
      <div class="empty-subtitle">Program paused at entry.<br>Click <b>Next</b> to allocate and initialize the ${dsName}.</div>
    `;
    nodesLayer.appendChild(emptyMsg);
    clearSimulation();
    return;
  }



  // 1. Render all Pointer Badges (head, root, first, second, etc.)
  const pointers = snapshot.pointers || [];
  for (let pIdx = 0; pIdx < pointers.length; pIdx++) {
    const ptr = pointers[pIdx];
    const badgeId = `badge-ptr-${ptr.name}`;
    activeIds.add(badgeId);

    const badgeEl = document.createElement('div');
    badgeEl.id = badgeId;
    const isHead = ptr.name === 'head' || ptr.name === 'root';
    badgeEl.className = `graph-badge-node ${isHead ? 'head-badge' : 'local-ptr-badge'}`;
    badgeEl.innerHTML = `<span>${ptr.name}</span>`;
    nodesLayer.appendChild(badgeEl);

    // Compute layout slot
    let targetCenterX = 85;
    let targetCenterY = 48;
    if (snapshot.structureType === 'tree') {
      if (ptr.targetNodeId) {
        const targetNode = nodes.find((n) => n.id === ptr.targetNodeId);
        if (targetNode) {
          const col = targetNode.treeColumn !== undefined ? targetNode.treeColumn : 0;
          const depth = targetNode.treeDepth !== undefined ? targetNode.treeDepth : 0;
          const sameTargetPtrs = pointers.filter((p) => p.targetNodeId === ptr.targetNodeId);
          const sameIdx = sameTargetPtrs.indexOf(ptr);
          const sameCount = sameTargetPtrs.length;
          const offset = sameCount > 1 ? (sameIdx - (sameCount - 1) / 2) * 55 : 0;
          targetCenterX = 140 + col * 75 + offset;
          targetCenterY = 75 + depth * 85 - 42;
        }
      } else {
        targetCenterX = 140 + pIdx * 90;
        targetCenterY = 32;
      }
    } else if (!isHead) {
      if (ptr.name === 'first') {
        targetCenterX = 85;
        targetCenterY = 145;
      } else if (ptr.name === 'second') {
        targetCenterX = 345;
        targetCenterY = 48;
      } else if (ptr.name === 'third') {
        targetCenterX = 510;
        targetCenterY = 48;
      } else {
        targetCenterX = 85 + pIdx * 95;
        targetCenterY = 220;
      }
    }

    registerD3Node(badgeId, badgeEl, targetCenterX, targetCenterY, 68, 26, 'ptr', resetPositions);
    makeDraggable(badgeEl, badgeId);

    // If pointer points to a node, register elastic spring link
    if (ptr.targetNodeId) {
      d3Links.push({
        source: badgeId,
        target: ptr.targetNodeId,
        distance: 95,
        strength: 0.75,
      });
    }

    // If pointer is null, render nullptr badge for it
    if (ptr.isNull) {
      const nullId = `badge-null-${ptr.name}`;
      activeIds.add(nullId);

      const nullBadge = document.createElement('div');
      nullBadge.id = nullId;
      nullBadge.className = 'graph-badge-node null-badge-node';
      nullBadge.innerHTML = `<span class="null-glyph">∅</span><span class="null-text">nullptr</span>`;
      nodesLayer.appendChild(nullBadge);

      registerD3Node(nullId, nullBadge, targetCenterX + 100, targetCenterY, 78, 26, 'null', resetPositions);
      makeDraggable(nullBadge, nullId);

      d3Links.push({
        source: badgeId,
        target: nullId,
        distance: 95,
        strength: 0.75,
      });
    } else {
      nodePositions.delete(`badge-null-${ptr.name}`);
      d3NodesMap.delete(`badge-null-${ptr.name}`);
    }
  }

  // Handle Tree Rendering
  if (snapshot.structureType === 'tree') {
    const detachedNodes = nodes.filter((n) => n.isDetached);
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      activeIds.add(node.id);

      const nodeEl = document.createElement('div');
      nodeEl.id = `node-${node.id}`;
      nodeEl.className = 'tree-node-card';
      if (node.isVisiting || node.id === snapshot.activeVisitingNodeId) {
        nodeEl.classList.add('visiting');
      }
      if (node.isNewlyConnected) {
        nodeEl.classList.add('new-connected');
      } else if (node.isNewlyCreated) {
        nodeEl.classList.add('new-created');
      }
      if (node.isDetached) {
        nodeEl.classList.add('detached');
      }

      // Value only
      nodeEl.innerHTML = `<span class="tree-node-val">${node.data}</span>`;
      nodesLayer.appendChild(nodeEl);

      let targetCenterX: number;
      let targetCenterY: number;

      if (node.isDetached) {
        const detachedIdx = detachedNodes.indexOf(node);
        targetCenterX = 80 + detachedIdx * 65;
        targetCenterY = 320;
      } else {
        const col = node.treeColumn !== undefined ? node.treeColumn : i;
        const depth = node.treeDepth !== undefined ? node.treeDepth : 0;
        targetCenterX = 140 + col * 75;
        targetCenterY = 75 + depth * 85;
      }

      registerD3Node(node.id, nodeEl, targetCenterX, targetCenterY, 46, 46, 'node', resetPositions);
      makeDraggable(nodeEl, node.id, onNodeTap);

      if (node.leftId && nodes.some((n) => n.id === node.leftId)) {
        d3Links.push({
          source: node.id,
          target: node.leftId,
          distance: 85,
          strength: 0.8,
        });
      }
      if (node.rightId && nodes.some((n) => n.id === node.rightId)) {
        d3Links.push({
          source: node.id,
          target: node.rightId,
          distance: 85,
          strength: 0.8,
        });
      }
    }

    // Remove obsolete bodies
    for (const [bodyId] of d3NodesMap.entries()) {
      if (!activeIds.has(bodyId)) {
        d3NodesMap.delete(bodyId);
        nodePositions.delete(bodyId);
      }
    }

    const currentD3Nodes = Array.from(d3NodesMap.values());
    const validLinks = d3Links.filter(
      (l) =>
        d3NodesMap.has(typeof l.source === 'string' ? l.source : l.source.id) &&
        d3NodesMap.has(typeof l.target === 'string' ? l.target : l.target.id)
    );
    initOrUpdateSimulation(currentD3Nodes, validLinks, resetPositions);
    return;
  }

  // Follow reachable chain from head
  const reachableNodes: ListNode[] = [];
  if (headId) {
    let currId: string | null = headId;
    const visited = new Set<string>();
    while (currId && !visited.has(currId)) {
      visited.add(currId);
      const node = nodes.find((n) => n.id === currId);
      if (node) {
        reachableNodes.push(node);
        currId = node.nextId ?? null;
      } else {
        break;
      }
    }
  }

  // 2. Render Reachable Chain Nodes
  for (let i = 0; i < reachableNodes.length; i++) {
    const node = reachableNodes[i];
    activeIds.add(node.id);

    const nodeEl = document.createElement('div');
    nodeEl.id = `node-${node.id}`;
    nodeEl.className = 'graph-node';
    if (node.isNewlyConnected) {
      nodeEl.classList.add('new-connected');
    } else if (node.isNewlyCreated) {
      nodeEl.classList.add('new-created');
    }

    const nextValDisplay = getNextAddressDisplay(node);
    const isSelectedSource =
      linkSourceId === node.id ||
      (node.variableName && linkSourceId === node.variableName) ||
      linkSourceId === `node-${node.id}`;

    if (isSelectedSource) {
      nodeEl.classList.add('link-source');
    }

    nodeEl.innerHTML = `
      <div class="graph-node-body">
        ${node.prevId !== undefined ? `<div class="graph-node-prev-cell" style="padding: 4px 6px; font-size: 10px; border-right: 1px solid var(--border-color); color: #36c779;"><span class="cell-label" style="display:block; font-size: 8px; opacity: 0.7;">PREV</span>${node.prevId ? '◀' : 'null'}</div>` : ''}
        <div class="graph-node-data-cell">
          <span class="cell-label">DATA</span>
          <span class="cell-val">${node.data}</span>
        </div>
        <div class="graph-node-next-cell ${isSelectedSource ? 'next-selected' : ''}" title="Press NEXT to link to another node">
          <span class="cell-label">NEXT</span>
          <span class="cell-next-val ${node.nextId ? 'has-target' : 'is-null'}">${nextValDisplay}</span>
        </div>
      </div>
    `;
    nodesLayer.appendChild(nodeEl);

    const targetCenterX = 180 + i * 165;
    const targetCenterY = 135;
    registerD3Node(node.id, nodeEl, targetCenterX, targetCenterY, 126, 50, 'node', resetPositions);
    makeDraggable(nodeEl, node.id, onNodeTap);

    const targetNodeExists = Boolean(node.nextId && nodes.some((n) => n.id === node.nextId));
    if (targetNodeExists) {
      d3Links.push({
        source: node.id,
        target: node.nextId!,
        distance: 160,
        strength: 0.65,
      });
      nodePositions.delete(`badge-null-${node.id}`);
      d3NodesMap.delete(`badge-null-${node.id}`);
    } else {
      // Terminal nullptr badge for node without target
      const nullId = `badge-null-${node.id}`;
      activeIds.add(nullId);

      const nullBadge = document.createElement('div');
      nullBadge.id = nullId;
      nullBadge.className = 'graph-badge-node null-badge-node';
      nullBadge.innerHTML = `<span class="null-glyph">∅</span><span class="null-text">nullptr</span>`;
      nodesLayer.appendChild(nullBadge);

      registerD3Node(nullId, nullBadge, targetCenterX + 120, targetCenterY, 78, 26, 'null', resetPositions);
      makeDraggable(nullBadge, nullId);

      d3Links.push({
        source: node.id,
        target: nullId,
        distance: 110,
        strength: 0.75,
      });
    }
  }

  // 3. Render Detached Unlinked Allocations
  const renderedNodeIds = new Set(reachableNodes.map((n) => n.id));
  const detachedNodes = nodes.filter((n) => !renderedNodeIds.has(n.id));
  for (let j = 0; j < detachedNodes.length; j++) {
    const node = detachedNodes[j];
    activeIds.add(node.id);

    const nodeEl = document.createElement('div');
    nodeEl.id = `node-${node.id}`;
    nodeEl.className = 'graph-node new-created';

    const nextValDisplay = getNextAddressDisplay(node);
    const isDetachedSource =
      linkSourceId === node.id ||
      (node.variableName && linkSourceId === node.variableName) ||
      linkSourceId === `node-${node.id}`;

    if (isDetachedSource) {
      nodeEl.classList.add('link-source');
    }

    nodeEl.innerHTML = `
      <div class="graph-node-body">
        <div class="graph-node-data-cell">
          <span class="cell-label">DATA</span>
          <span class="cell-val">${node.data}</span>
        </div>
        <div class="graph-node-next-cell ${isDetachedSource ? 'next-selected' : ''}" title="Press NEXT to link to another node">
          <span class="cell-label">NEXT</span>
          <span class="cell-next-val ${node.nextId ? 'has-target' : 'is-null'}">${nextValDisplay}</span>
        </div>
      </div>
    `;
    nodesLayer.appendChild(nodeEl);

    const baseIdx = reachableNodes.length === 0 ? j : reachableNodes.length + j;
    const targetCenterX = 180 + baseIdx * 165;
    const targetCenterY = 135;
    registerD3Node(node.id, nodeEl, targetCenterX, targetCenterY, 126, 50, 'node', resetPositions);
    makeDraggable(nodeEl, node.id, onNodeTap);

    const targetExists = Boolean(node.nextId && nodes.some((n) => n.id === node.nextId));
    if (targetExists) {
      d3Links.push({
        source: node.id,
        target: node.nextId!,
        distance: 160,
        strength: 0.65,
      });
      nodePositions.delete(`badge-null-${node.id}`);
      d3NodesMap.delete(`badge-null-${node.id}`);
    } else {
      const nullId = `badge-null-${node.id}`;
      activeIds.add(nullId);

      const nullBadge = document.createElement('div');
      nullBadge.id = nullId;
      nullBadge.className = 'graph-badge-node null-badge-node';
      nullBadge.innerHTML = `<span class="null-glyph">∅</span><span class="null-text">nullptr</span>`;
      nodesLayer.appendChild(nullBadge);

      registerD3Node(nullId, nullBadge, targetCenterX + 120, targetCenterY, 78, 26, 'null', resetPositions);
      makeDraggable(nullBadge, nullId);

      d3Links.push({
        source: node.id,
        target: nullId,
        distance: 110,
        strength: 0.75,
      });
    }
  }

  // Remove obsolete bodies no longer in current snapshot
  for (const [bodyId] of d3NodesMap.entries()) {
    if (!activeIds.has(bodyId)) {
      d3NodesMap.delete(bodyId);
      nodePositions.delete(bodyId);
    }
  }

  // Filter out any link whose source or target is not in d3NodesMap to avoid D3 force crash
  const validLinks = d3Links.filter((l) => {
    const srcId = typeof l.source === 'string' ? l.source : (l.source as any).id;
    const tgtId = typeof l.target === 'string' ? l.target : (l.target as any).id;
    return d3NodesMap.has(srcId) && d3NodesMap.has(tgtId);
  });

  // Update and wake D3 simulation
  initOrUpdateSimulation(Array.from(d3NodesMap.values()), validLinks, resetPositions);
}

function renderDiagram(snapshot: RenderSnapshot, resetPositions: boolean = false) {
  cancelActiveNodeDrag?.();
  if (isGraphSnapshot(snapshot)) {
    renderGraphDiagram(snapshot, resetPositions);
  } else {
    renderLinkedListDiagram(snapshot, resetPositions);
  }
}

const graphViewportResizeObserver = new ResizeObserver(() => {
  if (
    !currentSnapshot ||
    !isGraphSnapshot(currentSnapshot)
  ) {
    return;
  }

  graphFitPending = true;
  if (simulation && d3NodesMap.size > 0) {
    simulation.alpha(0.2).restart();
  } else {
    requestAnimationFrame(applyPendingGraphFit);
  }
});
graphViewportResizeObserver.observe(graphViewport);

// Event Listeners
const btnHome = document.getElementById('btnHome') as HTMLButtonElement;
let homeRequested = false;
btnHome.onclick = () => {
  homeRequested = true;
  isCreativeMode = false;
  if (creativePalette) creativePalette.style.display = 'none';
  cancelActiveNodeDrag?.();
  simulation?.stop();
  showView('initial');
  updateBadge('idle');
  btnInitialVisualize.disabled = true;
  vscode.postMessage({ command: 'goHome' });
};
btnInitialVisualize.onclick = () => {
  homeRequested = false;
  isCreativeMode = false;
  if (creativePalette) creativePalette.style.display = 'none';
  vscode.postMessage({ command: 'visualize' });
};

if (btnImportTutorial) {
  btnImportTutorial.onclick = () => vscode.postMessage({ command: 'importTutorial' });
}
if (btnCloseTutorial) {
  btnCloseTutorial.onclick = () => vscode.postMessage({ command: 'closeTutorial' });
}
if (lessonSelect) {
  lessonSelect.onchange = () => {
    const val = lessonSelect.value;
    if (val) {
      vscode.postMessage({ command: 'selectLesson', lessonId: val });
    }
  };
}
if (lessonGuideToggle && lessonGuideBody && lessonGuideIcon) {
  lessonGuideToggle.onclick = () => {
    const isHidden = lessonGuideBody.style.display === 'none';
    lessonGuideBody.style.display = isHidden ? 'block' : 'none';
    lessonGuideIcon.textContent = isHidden ? 'Hide ▲' : 'Show ▼';
  };
}

btnPrev.onclick = () => vscode.postMessage({ command: 'prev' });
btnNext.onclick = () => vscode.postMessage({ command: 'next' });
btnRestart.onclick = () => vscode.postMessage({ command: 'restart' });
btnRetry.onclick = () => vscode.postMessage({ command: 'retry' });
btnResetLayout.onclick = () => {
  if (currentSnapshot) {
    nodePositions.clear();
    d3NodesMap.clear();
    resetCameraView(true);
    renderDiagram(currentSnapshot, true);
  }
};
if (btnClearTerminal) {
  btnClearTerminal.onclick = () => {
    if (terminalText) terminalText.textContent = '';
    if (terminalPlaceholder) terminalPlaceholder.style.display = 'inline';
  };
}

// ==========================================
// Viewport Pan Navigation (Drag Background, Right-Click Drag, Middle-Click, Space+Drag)
// ==========================================

// Stop context menu so right-click is reserved for panning
graphViewport.addEventListener('contextmenu', (e) => {
  e.preventDefault();
});

function isInteractiveCanvasElement(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement || target instanceof SVGElement)) return false;
  return !!target.closest(
    '.graph-node, .array-cell, .stack-element-block, .queue-element-block, button, input, select, a, .dock-btn, .creative-palette-dock, .lesson-guide-card, .canvas-controls-overlay, .cell-next-val, .cell-data'
  );
}

graphViewport.addEventListener('pointerdown', (e: PointerEvent) => {
  const isRightOrMiddle = e.button === 2 || e.button === 1;
  const isSpace = isSpacePressed && e.button === 0;
  const isBackgroundClick = e.button === 0 && !isInteractiveCanvasElement(e.target);

  if (isRightOrMiddle || isSpace || isBackgroundClick) {
    e.preventDefault();
    e.stopPropagation();

    isPanning = true;
    startPanClientX = e.clientX;
    startPanClientY = e.clientY;
    initialPanX = cameraPanX;
    initialPanY = cameraPanY;

    graphViewport.classList.add('is-panning');
    document.body.classList.add('is-canvas-panning');
    try {
      graphViewport.setPointerCapture(e.pointerId);
    } catch {}
  }
});

const handlePointerMove = (e: PointerEvent) => {
  if (isPanning) {
    const dx = e.clientX - startPanClientX;
    const dy = e.clientY - startPanClientY;
    cameraPanX = initialPanX + dx;
    cameraPanY = initialPanY + dy;
    applyCameraTransform(false);
  }
};

const stopPanning = (e: PointerEvent) => {
  if (isPanning) {
    isPanning = false;
    graphViewport.classList.remove('is-panning');
    document.body.classList.remove('is-canvas-panning');
    try {
      graphViewport.releasePointerCapture(e.pointerId);
    } catch {}
  }
};

window.addEventListener('pointermove', handlePointerMove, { passive: true });
window.addEventListener('pointerup', stopPanning);
window.addEventListener('pointercancel', stopPanning);

// Zoom with mouse wheel (centered on cursor)
graphViewport.addEventListener('wheel', (e: WheelEvent) => {
  e.preventDefault();
  const rect = graphViewport.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;

  const zoomFactor = e.deltaY < 0 ? 1.09 : 0.91;
  const newZoom = Math.min(2.5, Math.max(0.05, cameraZoom * zoomFactor));

  cameraPanX = mouseX - (mouseX - cameraPanX) * (newZoom / cameraZoom);
  cameraPanY = mouseY - (mouseY - cameraPanY) * (newZoom / cameraZoom);
  cameraZoom = newZoom;

  applyCameraTransform(false);
}, { passive: false });

// Double click background to reset camera view
graphViewport.addEventListener('dblclick', (e: MouseEvent) => {
  if (
    (e.target as HTMLElement).closest(
      '.graph-node, .graph-vertex-card, .graph-badge-node, .canvas-controls-overlay'
    )
  ) {
    return;
  }
  resetCameraView(true);
  if (currentSnapshot && isGraphSnapshot(currentSnapshot)) {
    graphFitPending = true;
    requestAnimationFrame(applyPendingGraphFit);
  }
});

// Click background to cancel link mode if user clicked outside any node
graphViewport.addEventListener('click', (e: MouseEvent) => {
  if (linkMode && !(e.target as HTMLElement).closest('.graph-node')) {
    setLinkMode(false);
  }
});

// Spacebar hold for pan cursor
window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && linkMode) {
    setLinkMode(false);
    return;
  }
  if (e.code === 'Space' && !isSpacePressed && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
    isSpacePressed = true;
    graphViewport.classList.add('can-pan');
  }
});

window.addEventListener('keyup', (e) => {
  if (e.code === 'Space') {
    isSpacePressed = false;
    graphViewport.classList.remove('can-pan');
  }
});

// Message Handler from Extension Host
window.addEventListener('message', (event) => {
  const msg: ExtensionMessage = event.data;

  switch (msg.command) {
    case 'status': {
      isCreativeMode = false;
      if (creativePalette) creativePalette.style.display = 'none';
      if (msg.step === 'waiting' && currentSnapshot && activeView.style.display !== 'none') {
        break;
      }
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

    case 'examples': {
      renderExampleCatalog(msg.examples);
      break;
    }

    case 'home': {
      isCreativeMode = false;
      if (creativePalette) creativePalette.style.display = 'none';
      showView('initial');
      updateBadge('idle');
      btnInitialVisualize.disabled = false;
      vscode.postMessage({ command: 'getExamples' });
      break;
    }

    case 'updateState': {
      if (homeRequested) break;
      isCreativeMode = false;
      if (creativePalette) creativePalette.style.display = 'none';
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

      // Controls enable/disable
      btnNext.disabled = !canStepNext;
      btnPrev.disabled = !canStepPrev;
      btnRestart.disabled = !canRestart;

      const warningText =
        isGraphUpdateStateMessage(msg) && msg.snapshot.warnings?.length
          ? `\n\nWarnings: ${msg.snapshot.warnings.join(' ')}`
          : '';
      explanationText.textContent = `${snapshot.explanation}${warningText}`;
      updateTerminal(snapshot.terminalOutput);
      renderDiagram(snapshot, false);
      currentSnapshot = snapshot;
      // A re-snapshot replaces all canvas elements, so drop any in-progress link selection.
      clearLinkSelection();
      break;
    }

    case 'edgeApplied': {
      const { sourceNodeId, targetNodeId, highlighted, message } = msg;
      const prev = terminalText.textContent || '';
      terminalText.style.display = 'block';
      if (terminalPlaceholder) terminalPlaceholder.style.display = 'none';
      terminalText.textContent =
        prev +
        `\n✓ ${message}\n   Wiring inserted at line ${highlighted.startLine}${
          highlighted.endLine > highlighted.startLine ? `–${highlighted.endLine}` : ''
        }`;
      const vp = document.getElementById('terminalViewport');
      if (vp) vp.scrollTop = vp.scrollHeight;
      // Flash the linked nodes on canvas.
      const flash = (id: string | undefined, cls: string) => {
        if (!id) return;
        const el = document.getElementById(`node-${id}`);
        if (!el) return;
        el.classList.add(cls);
        setTimeout(() => el.classList.remove(cls), 2000);
      };
      flash(sourceNodeId, 'link-source');
      flash(targetNodeId, 'link-target');
      break;
    }

    case 'edgeError': {
      const prev = terminalText.textContent || '';
      terminalText.style.display = 'block';
      if (terminalPlaceholder) terminalPlaceholder.style.display = 'none';
      terminalText.textContent = prev + `\n✗ Link error: ${msg.message}${msg.details ? `\n   ${msg.details}` : ''}`;
      const vp = document.getElementById('terminalViewport');
      if (vp) vp.scrollTop = vp.scrollHeight;
      break;
    }

    case 'terminalOutput': {
      updateTerminal(msg.fullOutput);
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

    case 'targetFile': {
      if (targetFileName) {
        targetFileName.textContent = msg.fileName;
      }
      if (btnVisualizeText) {
        btnVisualizeText.textContent = `Visualize ${msg.fileName}`;
      }
      break;
    }

    case 'creativeFeedback': {
      const prev = terminalText.textContent || '';
      terminalText.style.display = 'block';
      if (terminalPlaceholder) terminalPlaceholder.style.display = 'none';
      terminalText.textContent = prev + `\n${msg.ok ? '✓' : '✗'} ${msg.message}`;
      const vp = document.getElementById('terminalViewport');
      if (vp) vp.scrollTop = vp.scrollHeight;
      break;
    }

    case 'creativeSyncState': {
      if (!isCreativeMode) break;
      const snap: LinkedListSnapshot =
        currentSnapshot && !isGraphSnapshot(currentSnapshot)
          ? currentSnapshot
          : createEmptySnapshot();
      currentSnapshot = snap;

      if (msg.stacks && msg.stacks.length > 0) {
        const s = msg.stacks[0];
        const capacity = Math.max(5, s.elements.length + 2);
        snap.stack = {
          name: s.varName,
          elements: s.elements.map((val, idx) => ({
            id: `stack-elem-${idx}`,
            value: val,
            index: idx,
            isTop: idx === s.elements.length - 1,
          })),
          topIndex: s.elements.length - 1,
          capacity,
          activeMethod: s.elements.length > 0 ? 'push' : 'init',
          methodParam: s.elements.length > 0 ? s.elements[s.elements.length - 1] : undefined,
        };
        snap.structureType = 'stack';
        renderDiagram(snap, false);
        break;
      }

      if (msg.queues && msg.queues.length > 0) {
        const q = msg.queues[0];
        const capacity = Math.max(5, q.elements.length + 2);
        const slots: QueueSlot[] = [];
        for (let i = 0; i < capacity; i++) {
          const hasVal = i < q.elements.length;
          slots.push({
            index: i,
            value: hasVal ? q.elements[i] : null,
            hasValue: hasVal,
            isFront: q.elements.length > 0 && i === 0,
            isRear: q.elements.length > 0 && i === q.elements.length - 1,
          });
        }
        snap.queue = {
          name: q.varName,
          slots,
          front: q.elements.length > 0 ? 0 : -1,
          rear: q.elements.length > 0 ? q.elements.length - 1 : -1,
          capacity,
          size: q.elements.length,
          isCircular: false,
          activeMethod: q.elements.length > 0 ? 'enqueue' : 'init',
          methodParam: q.elements.length > 0 ? q.elements[q.elements.length - 1] : undefined,
        };
        snap.structureType = 'queue';
        renderDiagram(snap, false);
        break;
      }

      if (msg.nodes && msg.nodes.length > 0) {
        snap.structureType = 'linked_list';
        snap.nodes = msg.nodes.map((pn) => {
          const isHead = pn.varName === 'head' || (!msg.nodes.some((o) => o.nextVar === pn.varName) && pn.varName !== 'second');
          return {
            id: pn.varName,
            data: pn.value,
            variableName: pn.varName,
            nextId: pn.nextVar || undefined,
            isHead,
            isDetached: !isHead && !pn.nextVar && !msg.nodes.some((o) => o.nextVar === pn.varName),
          };
        });
        const headNode = snap.nodes.find((n: ListNode) => n.isHead);
        if (headNode) {
          snap.hasHead = true;
          snap.headId = headNode.id;
        }
        renderDiagram(snap, false);
        break;
      }

      snap.nodes = [];
      snap.stack = undefined;
      snap.queue = undefined;
      snap.hasHead = false;
      snap.headId = null;
      renderDiagram(snap, false);
      break;
    }

    case 'sessionEnded': {
      updateBadge('terminated');
      btnNext.disabled = true;
      btnRestart.disabled = false;
      explanationText.textContent = msg.reason || 'Debugging session finished.';
      break;
    }

    case 'tutorialLoaded': {
      if (loadingView.style.display !== 'none') {
        showView('initial');
        updateBadge('idle');
      }
      if (tutorialDrawer && tutorialTitle && lessonSelect) {
        tutorialDrawer.style.display = 'block';
        tutorialTitle.textContent = msg.manifest.title;
        lessonSelect.innerHTML = '';
        msg.manifest.lessons.forEach((l) => {
          const opt = document.createElement('option');
          opt.value = l.id;
          opt.textContent = l.title;
          if (l.id === msg.activeLessonId) {
            opt.selected = true;
          }
          lessonSelect.appendChild(opt);
        });
      }
      const activeLesson = msg.manifest.lessons.find((l) => l.id === msg.activeLessonId);
      if (activeLesson && btnVisualizeText) {
        btnVisualizeText.textContent = `Visualize ${activeLesson.title}`;
      }
      if (lessonGuideCard && lessonGuideBody) {
        if (msg.guideMarkdown) {
          lessonGuideCard.style.display = 'block';
          lessonGuideBody.innerHTML = renderSimpleMarkdown(msg.guideMarkdown);
        } else {
          lessonGuideCard.style.display = 'none';
        }
      }
      break;
    }

    case 'lessonChanged': {
      if (lessonSelect) {
        lessonSelect.value = msg.lessonId;
        const opt = lessonSelect.options[lessonSelect.selectedIndex];
        if (opt && btnVisualizeText) {
          btnVisualizeText.textContent = `Visualize ${opt.textContent}`;
        }
      }
      if (lessonGuideCard && lessonGuideBody) {
        if (msg.guideMarkdown) {
          lessonGuideCard.style.display = 'block';
          lessonGuideBody.innerHTML = renderSimpleMarkdown(msg.guideMarkdown);
        } else {
          lessonGuideCard.style.display = 'none';
        }
      }
      break;
    }

    case 'tutorialClosed': {
      if (tutorialDrawer) {
        tutorialDrawer.style.display = 'none';
      }
      if (lessonGuideCard) {
        lessonGuideCard.style.display = 'none';
      }
      if (btnVisualizeText && targetFileName) {
        btnVisualizeText.textContent = `Visualize ${targetFileName.textContent || 'Active Code'}`;
      }
      break;
    }
  }
});

function renderExampleCatalog(examples: import('../src/sidebar/exampleCatalog').ExampleEntry[]) {
  const catalog = document.getElementById('exampleCatalog')!;
  catalog.replaceChildren();
  if (examples.length === 0) {
    catalog.textContent = 'No C++ examples found.';
    return;
  }
  const groups = new Map<string, HTMLElement>();
  for (const example of examples) {
    let group = groups.get(example.category);
    if (!group) {
      const section = document.createElement('section');
      section.className = 'example-category';
      const heading = document.createElement('h3');
      heading.textContent = example.category;
      section.appendChild(heading);
      group = document.createElement('div');
      group.className = 'example-list';
      section.appendChild(group);
      catalog.appendChild(section);
      groups.set(example.category, group);
    }
    const button = document.createElement('button');
    button.className = 'example-item';
    button.title = `Start simulation: ${example.fileName}`;
    const title = document.createElement('span');
    title.textContent = example.title;
    const file = document.createElement('small');
    file.textContent = example.fileName;
    button.append(title, file);
    button.onclick = () => {
      homeRequested = false;
      isCreativeMode = false;
      if (creativePalette) creativePalette.style.display = 'none';
      vscode.postMessage({ command: 'visualizeExample', example: example.fileName });
    };
    group.appendChild(button);
  }
}

// ==========================================
// Creative Mode / Real-Time C++ Studio
// ==========================================

let isCreativeMode = false;

function createEmptySnapshot(): LinkedListSnapshot {
  return {
    stepNumber: 1,
    explanation: 'Creative Canvas',
    hasHead: false,
    headId: null,
    nodes: [],
    changeType: 'init',
    source: { file: targetFileName?.textContent || '', line: 1 },
  };
}

function getCreativeSnapshot(): LinkedListSnapshot {
  if (!currentSnapshot || isGraphSnapshot(currentSnapshot)) {
    const snap = createEmptySnapshot();
    currentSnapshot = snap;
    return snap;
  }
  return currentSnapshot;
}

function openCreativeStudio() {
  isCreativeMode = true;
  showView('active');
  updateBadge('idle');

  if (creativePalette) creativePalette.style.display = 'flex';
  if (cardTitle) cardTitle.textContent = 'Creative Studio';
  if (explanationText) {
    explanationText.textContent =
      'Creative Mode: Click "+ Node", "+ Stack", or "+ Queue" to build data structures visually and write C++ in real time!';
  }

  // Creative mode always starts with a blank C++ file and blank canvas
  const snap = getCreativeSnapshot();
  snap.structureType = 'linked_list';
  snap.nodes = [];
  snap.stack = undefined;
  snap.queue = undefined;
  snap.hasHead = false;
  snap.headId = null;
  renderDiagram(snap, false);

  if (terminalText) {
    terminalText.style.display = 'block';
    if (terminalPlaceholder) terminalPlaceholder.style.display = 'none';
    terminalText.textContent =
      'Creative Mode started with blank C++ file (creative.cpp).\nClick "+ Node", "+ Stack", or "+ Queue" to build data structures and generate C++ in real-time.';
  }

  vscode.postMessage({ command: 'creativeStart' });
}

function addCreativeNode() {
  const snap = getCreativeSnapshot();
  snap.structureType = 'linked_list';
  const existing = snap.nodes;
  let varName = 'head';
  if (existing.length > 0) {
    let idx = existing.length + 1;
    varName = idx === 2 ? 'second' : `node${idx}`;
    while (existing.some((n: ListNode) => n.variableName === varName || n.id === varName)) {
      idx++;
      varName = `node${idx}`;
    }
  }

  const value = (existing.length + 1) * 10;
  const newNode: ListNode = {
    id: varName,
    data: value,
    variableName: varName,
    isHead: existing.length === 0,
    isNewlyCreated: true,
    isDetached: existing.length > 0,
  };

  snap.nodes.push(newNode);
  if (newNode.isHead) {
    snap.hasHead = true;
    snap.headId = newNode.id;
  }
  renderDiagram(snap, false);

  vscode.postMessage({
    command: 'creativeAddNode',
    nodeType: 'linkedlist',
    varName,
    value,
  });

  const prev = terminalText.textContent || '';
  terminalText.style.display = 'block';
  if (terminalPlaceholder) terminalPlaceholder.style.display = 'none';
  terminalText.textContent =
    prev +
    `\n[Added] Node* ${varName} = new Node(${value}); in C++\nTap NEXT cell on any node, then tap another node to link them!`;
  const vp = document.getElementById('terminalViewport');
  if (vp) vp.scrollTop = vp.scrollHeight;
}

function addCreativeStack() {
  const snap = getCreativeSnapshot();
  const currentStack = snap.stack;
  const currentCount = currentStack ? currentStack.elements.length : 0;
  const value = (currentCount + 1) * 10;
  const capacity = Math.max(5, currentCount + 3);

  const elements: StackElement[] = currentStack ? [...currentStack.elements] : [];
  elements.push({
    id: `stack-elem-${currentCount}`,
    value,
    index: currentCount,
    isTop: true,
    isPushing: true,
  });
  if (elements.length > 1) {
    elements[elements.length - 2].isTop = false;
    elements[elements.length - 2].isPushing = false;
  }

  snap.structureType = 'stack';
  snap.stack = {
    name: 's',
    elements,
    topIndex: elements.length - 1,
    capacity,
    activeMethod: 'push',
    methodParam: value,
  };

  renderDiagram(snap, false);

  vscode.postMessage({
    command: 'creativeStackPush',
    varName: 's',
    value,
  });

  const prev = terminalText.textContent || '';
  terminalText.style.display = 'block';
  if (terminalPlaceholder) terminalPlaceholder.style.display = 'none';
  terminalText.textContent = prev + `\n[Added] s.push(${value}); in C++`;
  const vp = document.getElementById('terminalViewport');
  if (vp) vp.scrollTop = vp.scrollHeight;
}

function addCreativeQueue() {
  const snap = getCreativeSnapshot();
  const currentQ = snap.queue;
  const currentCount = currentQ ? currentQ.size : 0;
  const value = (currentCount + 1) * 10;
  const capacity = Math.max(5, currentCount + 3);

  const elements: number[] = [];
  if (currentQ) {
    for (let i = 0; i < currentQ.capacity; i++) {
      if (currentQ.slots[i] && currentQ.slots[i].hasValue && currentQ.slots[i].value !== null) {
        elements.push(Number(currentQ.slots[i].value));
      }
    }
  }
  elements.push(value);

  const slots: QueueSlot[] = [];
  for (let i = 0; i < capacity; i++) {
    const hasVal = i < elements.length;
    slots.push({
      index: i,
      value: hasVal ? elements[i] : null,
      hasValue: hasVal,
      isFront: elements.length > 0 && i === 0,
      isRear: elements.length > 0 && i === elements.length - 1,
      isEnqueuing: i === elements.length - 1,
    });
  }

  snap.structureType = 'queue';
  snap.queue = {
    name: 'q',
    slots,
    front: elements.length > 0 ? 0 : -1,
    rear: elements.length > 0 ? elements.length - 1 : -1,
    capacity,
    size: elements.length,
    isCircular: false,
    activeMethod: 'enqueue',
    methodParam: value,
  };

  renderDiagram(snap, false);

  vscode.postMessage({
    command: 'creativeQueuePush',
    varName: 'q',
    value,
  });

  const prev = terminalText.textContent || '';
  terminalText.style.display = 'block';
  if (terminalPlaceholder) terminalPlaceholder.style.display = 'none';
  terminalText.textContent = prev + `\n[Added] q.push(${value}); in C++`;
  const vp = document.getElementById('terminalViewport');
  if (vp) vp.scrollTop = vp.scrollHeight;
}

function setupCreativeEvents() {
  if (btnInitialCreative) btnInitialCreative.onclick = openCreativeStudio;

  if (dockAddNode) {
    dockAddNode.onclick = () => addCreativeNode();
  }
  if (dockAddStack) {
    dockAddStack.onclick = () => addCreativeStack();
  }
  if (dockAddQueue) {
    dockAddQueue.onclick = () => addCreativeQueue();
  }
}

// Initial View Setup
setupCreativeEvents();
showView('initial');
updateBadge('idle');
vscode.postMessage({ command: 'requestState' });
vscode.postMessage({ command: 'getTargetFile' });
vscode.postMessage({ command: 'getExamples' });
