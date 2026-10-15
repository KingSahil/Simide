import { LinkedListSnapshot, ListNode, PointerVariable } from './linkedListModel';

export class ExplanationGenerator {
  public static generate(
    currentNodes: ListNode[],
    headId: string | null,
    previousSnapshot?: LinkedListSnapshot,
    hasHead: boolean = true,
    pointers: PointerVariable[] = [],
    printedInStep?: string | null,
    accumulatedOutput?: string
  ): { explanation: string; changeType: LinkedListSnapshot['changeType'] } {
    if (!hasHead) {
      return {
        explanation: 'Program paused at main(). Click Next to execute: Node* head = nullptr;',
        changeType: 'init',
      };
    }

    // 0. Check if the executed step printed output to terminal
    if (printedInStep) {
      const cleanPrint = printedInStep.replace(/\n$/, '');
      const totalClean = (accumulatedOutput || '').trim();
      const summaryText = totalClean.length > 0 ? ` Program output: ${totalClean}` : '';
      return {
        explanation: `Printed to terminal: "${cleanPrint}".${summaryText}`,
        changeType: 'print',
      };
    }

    // Build current reachable chain from head
    const chain: ListNode[] = [];
    let currId: string | null = headId;
    const visited = new Set<string>();
    while (currId && !visited.has(currId)) {
      visited.add(currId);
      const found = currentNodes.find((n) => n.id === currId);
      if (found) {
        chain.push(found);
        currId = found.nextId;
      } else {
        break;
      }
    }

    const prevNodes = previousSnapshot?.nodes || [];

    // 1. Check for Deleted Nodes (Freed Heap Memory)
    if (previousSnapshot && prevNodes.length > 0) {
      const deletedNodes = prevNodes.filter((p) => !currentNodes.some((c) => c.id === p.id));
      if (deletedNodes.length > 0) {
        const delNode = deletedNodes[0];
        const ptr = previousSnapshot.pointers?.find((p) => p.targetNodeId === delNode.id && p.name !== 'head');
        const ptrRef = ptr ? ` ('${ptr.name}')` : '';
        return {
          explanation: `Freed heap memory for node containing ${delNode.data}${ptrRef} via delete.`,
          changeType: 'node_deleted',
        };
      }
    }

    // 2. Check for In-Place Value Updates (e.g. head->data = 10 or second->data = 20)
    if (previousSnapshot) {
      for (const currNode of currentNodes) {
        const prevNode = prevNodes.find((p) => p.id === currNode.id);
        if (prevNode && prevNode.data !== currNode.data) {
          const ptr = pointers.find((p) => p.targetNodeId === currNode.id);
          const ref = ptr ? ` ('${ptr.name}')` : '';
          return {
            explanation: `Assigned value ${currNode.data} to node${ref} (data updated: ${prevNode.data} → ${currNode.data}).`,
            changeType: 'step',
          };
        }
      }
    }

    // 3. Check for Link Bypass / Redirection / Severing
    if (previousSnapshot) {
      for (const currNode of currentNodes) {
        const prevNode = prevNodes.find((p) => p.id === currNode.id);
        if (prevNode && prevNode.nextId !== currNode.nextId) {
          const oldTarget = prevNodes.find((p) => p.id === prevNode.nextId);
          const newTarget = currentNodes.find((c) => c.id === currNode.nextId);

          // Case A: Link bypassed an existing node (e.g. first->next = third)
          if (oldTarget && newTarget && oldTarget.id !== newTarget.id) {
            return {
              explanation: `Node containing ${currNode.data} unlinked from node ${oldTarget.data} and now points directly to node ${newTarget.data} (bypassing node ${oldTarget.data}).`,
              changeType: 'node_bypassed',
            };
          }

          // Case B: Severed link to nullptr
          if (oldTarget && !newTarget) {
            return {
              explanation: `Node containing ${currNode.data} disconnected from node ${oldTarget.data} (next pointer set to nullptr).`,
              changeType: 'node_bypassed',
            };
          }

          // Case C: New link established (e.g. first->next = second or second->next = third)
          if (!oldTarget && newTarget) {
            return {
              explanation: `The node containing ${currNode.data} now points to the node containing ${newTarget.data}.`,
              changeType: 'node_linked',
            };
          }
        }
      }
    }

    // 3. Check for Head Pointer Assignment / Redirection
    if (previousSnapshot && previousSnapshot.headId !== headId) {
      if (!previousSnapshot.headId && headId) {
        const headNode = currentNodes.find((n) => n.id === headId);
        const aliasPtrs = pointers
          .filter((p) => p.targetNodeId === headId && p.name !== 'head')
          .map((p) => p.name);
        const aliasText =
          aliasPtrs.length > 0
            ? `head points to the node containing ${headNode?.data ?? ''} (aliasing pointer '${aliasPtrs.join(', ')}' at address ${headNode?.address ?? ''}).`
            : `head points to the node containing ${headNode?.data ?? ''}.`;
        return {
          explanation: aliasText,
          changeType: 'head_assigned',
        };
      } else if (previousSnapshot.headId && headId) {
        const headNode = currentNodes.find((n) => n.id === headId);
        return {
          explanation: `head pointer updated to point to node containing ${headNode?.data ?? ''}.`,
          changeType: 'head_assigned',
        };
      } else if (!headId) {
        return {
          explanation: 'head is now nullptr. The linked list is empty.',
          changeType: 'step',
        };
      }
    }

    // 4. Check for New Node Creation
    if (previousSnapshot) {
      const newNodes = currentNodes.filter((c) => !prevNodes.some((p) => p.id === c.id));
      if (newNodes.length > 0) {
        const newest = newNodes[newNodes.length - 1];
        const ptr = pointers.find((p) => p.targetNodeId === newest.id && p.name !== 'head');
        const ptrName = ptr ? ptr.name : 'pointer';
        if (newest.isDetached) {
          return {
            explanation: `${ptrName} pointer created, pointing to a new Node containing ${newest.data}. It is not yet connected to the list.`,
            changeType: 'node_created',
          };
        } else {
          return {
            explanation: `New node containing ${newest.data} allocated and connected to the list.`,
            changeType: 'node_linked',
          };
        }
      }
    }

    // 5. Check for Pointer Traversal / Movement (e.g. temp = temp->next in loops)
    if (previousSnapshot) {
      for (const currPtr of pointers) {
        if (currPtr.name === 'head') continue;
        const prevPtr = previousSnapshot.pointers?.find((p) => p.name === currPtr.name);
        if (prevPtr && prevPtr.targetNodeId !== currPtr.targetNodeId) {
          if (currPtr.isNull || !currPtr.targetNodeId) {
            return {
              explanation: `Pointer '${currPtr.name}' updated to nullptr (reached end of list).`,
              changeType: 'pointer_moved',
            };
          } else {
            const targetNode = currentNodes.find((n) => n.id === currPtr.targetNodeId);
            return {
              explanation: `Pointer '${currPtr.name}' advanced to node containing ${targetNode?.data ?? ''}.`,
              changeType: 'pointer_moved',
            };
          }
        } else if (!prevPtr && !currPtr.isNull && currPtr.targetNodeId) {
          const targetNode = currentNodes.find((n) => n.id === currPtr.targetNodeId);
          return {
            explanation: `Pointer '${currPtr.name}' initialized, pointing to node containing ${targetNode?.data ?? ''}.`,
            changeType: 'pointer_moved',
          };
        }
      }
    }

    // 6. Initial / Empty / Detached fallback states
    if (!headId) {
      const detachedNodes = currentNodes.filter((n) => n.isDetached);
      if (detachedNodes.length === 0) {
        return {
          explanation: 'head is initialized to nullptr. The linked list is currently empty.',
          changeType: 'init',
        };
      } else {
        const newest = detachedNodes[detachedNodes.length - 1];
        const ptr = pointers.find((p) => p.targetNodeId === newest.id);
        const ptrName = ptr ? ptr.name : 'first';
        return {
          explanation: `${ptrName} pointer created, pointing to a new Node containing ${newest.data}. head is still null.`,
          changeType: 'node_created',
        };
      }
    }

    // 7. General Chain Status Fallback
    if (chain.length === 1) {
      return {
        explanation: `The first node is connected. head points to the node containing ${chain[0].data}.`,
        changeType: 'head_assigned',
      };
    } else if (chain.length === 2) {
      return {
        explanation: `The first node now points to the second node: head → ${chain[0].data} → ${chain[1].data} → nullptr.`,
        changeType: 'node_linked',
      };
    } else if (chain.length >= 3) {
      return {
        explanation: `Linked list: head → ${chain.map((n) => n.data).join(' → ')} → nullptr.`,
        changeType: 'node_linked',
      };
    }

    return {
      explanation: `Current list: head points to ${chain.length} node(s).`,
      changeType: 'step',
    };
  }
}
