import { LinkedListSnapshot, ListNode, ArrayVariable, IndexPointer } from '../src/visualization/linkedListModel';
import { ExtensionMessage, WebviewMessage } from '../src/sidebar/messages';
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
const cardTitle = document.getElementById('cardTitle') as HTMLSpanElement | null;
const canvasHint = document.getElementById('canvasHint') as HTMLDivElement | null;
const stepChip = document.getElementById('stepChip') as HTMLSpanElement;
const graphViewport = document.getElementById('graphViewport') as HTMLDivElement;
const graphCanvas = document.getElementById('graphCanvas') as HTMLDivElement;
const arrowsSvg = document.getElementById('arrowsSvg') as unknown as SVGSVGElement;
const arrowsGroup = document.getElementById('arrowsGroup') as unknown as SVGGElement | null;
const nodesLayer = document.getElementById('nodesLayer') as HTMLDivElement;
const explanationText = document.getElementById('explanationText') as HTMLDivElement;
const terminalPlaceholder = document.getElementById('terminalPlaceholder') as HTMLSpanElement;
const terminalText = document.getElementById('terminalText') as HTMLPreElement;
const btnClearTerminal = document.getElementById('btnClearTerminal') as HTMLButtonElement;

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
let currentSnapshot: LinkedListSnapshot | null = null;

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
    const target = currentSnapshot?.nodes.find((n) => n.id === node.nextId);
    if (target?.address) {
      return formatMemoryAddress(target.address, 'nullptr');
    }
    return node.nextId;
  }
  if (node.nextAddress && currentSnapshot?.nodes.some((n) => n.address === node.nextAddress)) {
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

// Make DOM elements draggable with live arrow updates & zoom support
function makeDraggable(el: HTMLElement, id: string) {
  el.onpointerdown = (e: PointerEvent) => {
    // Left click only (Right click and middle click are for panning)
    if (e.button !== 0 || isSpacePressed) return;
    e.preventDefault();
    e.stopPropagation();

    const d3Node = d3NodesMap.get(id);
    if (!d3Node || !simulation) return;

    el.setPointerCapture(e.pointerId);
    el.classList.add('dragging');

    // Wake simulation with target alpha so attached nodes continuously spring and bounce while dragging
    simulation.alphaTarget(0.5).restart();
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

    const onPointerUp = (upEv: PointerEvent) => {
      try {
        el.releasePointerCapture(upEv.pointerId);
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
      if (simulation) {
        simulation.alphaTarget(0);
        simulation.alpha(0.6).restart();
      }

      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', onPointerUp);
      el.removeEventListener('pointercancel', onPointerUp);
    };

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
  } else if (color === '#36C779') {
    marker = 'url(#arrowHeadGreen)';
  }
  pathEl.setAttribute('marker-end', marker);
  if (arrowsGroup) {
    arrowsGroup.appendChild(pathEl);
  } else {
    arrowsSvg.appendChild(pathEl);
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

  if (!currentSnapshot || !currentSnapshot.hasHead || currentSnapshot.structureType === 'array') return;

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
 */
function makeArrayElementDraggable(cellEl: HTMLElement, isElevated: boolean) {
  cellEl.onpointerdown = (e: PointerEvent) => {
    // Only left click (button 0) and not during spacebar camera panning
    if (e.button !== 0 || isSpacePressed) return;
    e.preventDefault();
    e.stopPropagation();

    cellEl.setPointerCapture(e.pointerId);
    cellEl.classList.add('dragging');
    cellEl.style.zIndex = '50';
    cellEl.style.transition = 'none';

    const startX = e.clientX;
    const startY = e.clientY;
    const initialBaseY = isElevated ? -16 : 0;

    const onPointerMove = (moveEv: PointerEvent) => {
      const dx = (moveEv.clientX - startX) / cameraZoom;
      const dy = (moveEv.clientY - startY) / cameraZoom;
      cellEl.style.transform = `translate(${dx}px, ${initialBaseY + dy}px) scale(1.1)`;
    };

    const onPointerUp = (upEv: PointerEvent) => {
      try {
        cellEl.releasePointerCapture(upEv.pointerId);
      } catch {}

      cellEl.classList.remove('dragging');
      // Satisfying physical spring overshoot bounce-back
      cellEl.style.transition = 'transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.3s ease';
      cellEl.style.transform = isElevated ? 'translateY(-16px) scale(1.06)' : 'translate(0px, 0px) scale(1)';

      setTimeout(() => {
        if (!cellEl.classList.contains('dragging')) {
          cellEl.style.zIndex = '';
          cellEl.style.transition = '';
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
function renderArrayDiagram(snapshot: LinkedListSnapshot) {
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

      const isElevated = elem.isActive || elem.isModified || matchingPointers.length > 0;

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

// Render the interactive graph with physics and dynamic arrows
function renderDiagram(snapshot: LinkedListSnapshot, resetPositions: boolean = false) {
  currentSnapshot = snapshot;
  nodesLayer.innerHTML = '';
  d3Links = [];
  const activeIds = new Set<string>();

  if (cardTitle) {
    if (snapshot.structureType === 'array') {
      cardTitle.textContent = 'ARRAY';
    } else if (snapshot.structureType === 'tree') {
      cardTitle.textContent = 'BINARY TREE';
    } else {
      cardTitle.textContent = 'LINKED LIST';
    }
  }

  if (canvasHint) {
    if (snapshot.structureType === 'array') {
      canvasHint.textContent = 'Contiguous memory slots • Floating index pointers • Scroll horizontally to explore';
    } else {
      canvasHint.textContent = 'Drag nodes to move • Right-click drag to pan • Scroll to zoom';
    }
  }

  if (resetPositions) {
    nodePositions.clear();
    d3NodesMap.clear();
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

    const dsName =
      snapshot.structureType === 'tree'
        ? 'tree'
        : snapshot.structureType === 'array'
        ? 'array'
        : 'linked list';
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
    if (simulation) {
      simulation.stop();
      simulation.nodes([]);
    }
    return;
  }

  // Handle Array Rendering
  if (snapshot.structureType === 'array') {
    renderArrayDiagram(snapshot);
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
      makeDraggable(nodeEl, node.id);

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

    nodeEl.innerHTML = `
      <div class="graph-node-body">
        <div class="graph-node-data-cell">
          <span class="cell-label">DATA</span>
          <span class="cell-val">${node.data}</span>
        </div>
        <div class="graph-node-next-cell">
          <span class="cell-label">NEXT</span>
          <span class="cell-next-val ${node.nextId ? 'has-target' : 'is-null'}">${nextValDisplay}</span>
        </div>
      </div>
    `;
    nodesLayer.appendChild(nodeEl);

    const targetCenterX = 180 + i * 165;
    const targetCenterY = 135;
    registerD3Node(node.id, nodeEl, targetCenterX, targetCenterY, 126, 50, 'node', resetPositions);
    makeDraggable(nodeEl, node.id);

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
  const detachedNodes = nodes.filter((n) => n.isDetached);
  for (let j = 0; j < detachedNodes.length; j++) {
    const node = detachedNodes[j];
    activeIds.add(node.id);

    const nodeEl = document.createElement('div');
    nodeEl.id = `node-${node.id}`;
    nodeEl.className = 'graph-node new-created';

    const nextValDisplay = getNextAddressDisplay(node);

    nodeEl.innerHTML = `
      <div class="graph-node-body">
        <div class="graph-node-data-cell">
          <span class="cell-label">DATA</span>
          <span class="cell-val">${node.data}</span>
        </div>
        <div class="graph-node-next-cell">
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
    makeDraggable(nodeEl, node.id);

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

// Event Listeners
btnInitialVisualize.onclick = () => vscode.postMessage({ command: 'visualize' });
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

// Viewport Pan Navigation (Right-Click Drag, Middle-Click, Space+Left-Click)
graphViewport.addEventListener('contextmenu', (e) => {
  e.preventDefault(); // Stop context menu so right-click is reserved for panning
});

graphViewport.addEventListener('pointerdown', (e: PointerEvent) => {
  if (e.button === 2 || e.button === 1 || (e.button === 0 && isSpacePressed)) {
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

graphViewport.addEventListener('pointermove', (e: PointerEvent) => {
  if (isPanning) {
    const dx = e.clientX - startPanClientX;
    const dy = e.clientY - startPanClientY;
    cameraPanX = initialPanX + dx;
    cameraPanY = initialPanY + dy;
    applyCameraTransform(false);
  }
});

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

graphViewport.addEventListener('pointerup', stopPanning);
graphViewport.addEventListener('pointercancel', stopPanning);

// Zoom with mouse wheel (centered on cursor)
graphViewport.addEventListener('wheel', (e: WheelEvent) => {
  e.preventDefault();
  const rect = graphViewport.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;

  const zoomFactor = e.deltaY < 0 ? 1.09 : 0.91;
  const newZoom = Math.min(2.5, Math.max(0.35, cameraZoom * zoomFactor));

  cameraPanX = mouseX - (mouseX - cameraPanX) * (newZoom / cameraZoom);
  cameraPanY = mouseY - (mouseY - cameraPanY) * (newZoom / cameraZoom);
  cameraZoom = newZoom;

  applyCameraTransform(false);
}, { passive: false });

// Double click background to reset camera view
graphViewport.addEventListener('dblclick', (e: MouseEvent) => {
  if ((e.target as HTMLElement).closest('.graph-node, .graph-badge-node, .canvas-controls-overlay')) {
    return;
  }
  resetCameraView(true);
});

// Spacebar hold for pan cursor
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && !isSpacePressed && document.activeElement?.tagName !== 'INPUT') {
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

      // Controls enable/disable
      btnNext.disabled = !canStepNext;
      btnPrev.disabled = !canStepPrev;
      btnRestart.disabled = !canRestart;

      // Terminal output
      updateTerminal(snapshot.terminalOutput);

      // Render interactive diagram
      renderDiagram(snapshot, false);
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
