"use strict";
(() => {
  // webview/app.ts
  var vscode = acquireVsCodeApi();
  var initialView = document.getElementById("initialView");
  var loadingView = document.getElementById("loadingView");
  var loadingText = document.getElementById("loadingText");
  var loadingSubtext = document.getElementById("loadingSubtext");
  var activeView = document.getElementById("activeView");
  var errorView = document.getElementById("errorView");
  var errorMessage = document.getElementById("errorMessage");
  var errorDetails = document.getElementById("errorDetails");
  var badgeDot = document.getElementById("badgeDot");
  var badgeText = document.getElementById("badgeText");
  var stepChip = document.getElementById("stepChip");
  var vizDiagram = document.getElementById("vizDiagram");
  var detachedContainer = document.getElementById("detachedContainer");
  var detachedDiagram = document.getElementById("detachedDiagram");
  var explanationText = document.getElementById("explanationText");
  var historyBanner = document.getElementById("historyBanner");
  var btnInitialVisualize = document.getElementById("btnInitialVisualize");
  var btnPrev = document.getElementById("btnPrev");
  var btnNext = document.getElementById("btnNext");
  var btnRestart = document.getElementById("btnRestart");
  var btnRetry = document.getElementById("btnRetry");
  function showView(view) {
    initialView.style.display = view === "initial" ? "flex" : "none";
    loadingView.style.display = view === "loading" ? "flex" : "none";
    activeView.style.display = view === "active" ? "block" : "none";
    errorView.style.display = view === "error" ? "flex" : "none";
    btnRestart.style.display = view === "active" || view === "error" ? "inline-flex" : "none";
  }
  function updateBadge(status) {
    badgeDot.className = "badge-dot";
    if (status === "paused") {
      badgeDot.classList.add("active");
      badgeText.textContent = "Paused";
    } else if (status === "running") {
      badgeDot.classList.add("running");
      badgeText.textContent = "Running";
    } else if (status === "error") {
      badgeDot.classList.add("error");
      badgeText.textContent = "Error";
    } else if (status === "terminated") {
      badgeText.textContent = "Terminated";
    } else {
      badgeText.textContent = "Idle";
    }
  }
  function createArrowSvg() {
    return `
    <div class="arrow-segment">
      <svg class="arrow-svg" viewBox="0 0 28 16" fill="none">
        <path d="M2 8H22M22 8L16 4M22 8L16 12" stroke="#0066FF" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </div>
  `;
  }
  function renderNodeBox(node, isHighlight = false) {
    const highlightClass = isHighlight || node.isNewlyCreated || node.isNewlyConnected ? "highlight" : "";
    const labelHtml = node.variableName ? `<span class="node-label">${node.variableName}</span>` : "";
    const nextIndicator = node.nextId ? "\u2022" : "\u2205";
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
  function renderDiagram(snapshot) {
    vizDiagram.innerHTML = "";
    detachedDiagram.innerHTML = "";
    const { headId, nodes } = snapshot;
    const reachableNodes = [];
    if (headId) {
      let currId = headId;
      const visited = /* @__PURE__ */ new Set();
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
    const detachedNodes = nodes.filter((n) => n.isDetached);
    if (detachedNodes.length > 0) {
      detachedContainer.style.display = "block";
      let detachedHtml = "";
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
      detachedContainer.style.display = "none";
    }
  }
  btnInitialVisualize.onclick = () => vscode.postMessage({ command: "visualize" });
  btnPrev.onclick = () => vscode.postMessage({ command: "prev" });
  btnNext.onclick = () => vscode.postMessage({ command: "next" });
  btnRestart.onclick = () => vscode.postMessage({ command: "restart" });
  btnRetry.onclick = () => vscode.postMessage({ command: "retry" });
  window.addEventListener("message", (event) => {
    const msg = event.data;
    switch (msg.command) {
      case "status": {
        showView("loading");
        loadingText.textContent = msg.text;
        if (msg.step === "compiling") {
          loadingSubtext.textContent = "Compiling C++ source with -g -O0";
        } else if (msg.step === "launching") {
          loadingSubtext.textContent = "Launching GDB / LLDB debugger";
        } else if (msg.step === "waiting") {
          loadingSubtext.textContent = "Waiting for debugger stop at entry point";
        }
        updateBadge("running");
        break;
      }
      case "updateState": {
        showView("active");
        const { snapshot, canStepNext, canStepPrev, canRestart, isPaused, isRunning } = msg;
        if (isPaused) {
          updateBadge("paused");
        } else if (isRunning) {
          updateBadge("running");
        }
        stepChip.textContent = `Step ${snapshot.stepNumber}`;
        explanationText.textContent = snapshot.explanation;
        if (snapshot.isHistorical) {
          historyBanner.style.display = "inline-block";
          historyBanner.textContent = `Viewing step ${snapshot.stepNumber} of ${msg.totalSnapshots} (historical)`;
        } else {
          historyBanner.style.display = "none";
        }
        btnNext.disabled = !canStepNext;
        btnPrev.disabled = !canStepPrev;
        btnRestart.disabled = !canRestart;
        renderDiagram(snapshot);
        break;
      }
      case "error": {
        showView("error");
        updateBadge("error");
        errorMessage.textContent = msg.message;
        errorDetails.textContent = msg.details || "";
        btnRetry.style.display = msg.canRetry ? "inline-flex" : "none";
        break;
      }
      case "sessionEnded": {
        updateBadge("terminated");
        btnNext.disabled = true;
        btnRestart.disabled = false;
        explanationText.textContent = msg.reason || "Debugging session finished.";
        break;
      }
    }
  });
  showView("initial");
  updateBadge("idle");
  vscode.postMessage({ command: "requestState" });
})();
//# sourceMappingURL=webview.js.map
