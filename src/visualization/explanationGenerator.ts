import { LinkedListSnapshot, ListNode, PointerVariable } from './linkedListModel';

export class ExplanationGenerator {
  public static generate(
    currentNodes: ListNode[],
    headId: string | null,
    previousSnapshot?: LinkedListSnapshot,
    hasHead: boolean = true,
    pointers: PointerVariable[] = []
  ): { explanation: string; changeType: LinkedListSnapshot['changeType'] } {
    if (!hasHead) {
      return {
        explanation: 'Program paused at main(). Click Next to execute: Node* head = nullptr;',
        changeType: 'init',
      };
    }

    // Case 1: Empty list (head is null)
    if (!headId) {
      const detachedNodes = currentNodes.filter((n) => n.isDetached);
      if (detachedNodes.length === 0) {
        return {
          explanation: 'head is initialized to nullptr. The linked list is currently empty.',
          changeType: 'init',
        };
      } else {
        // Node allocated locally before head assignment
        const newest = detachedNodes[detachedNodes.length - 1];
        const ptr = pointers.find((p) => p.targetNodeId === newest.id);
        const ptrName = ptr ? ptr.name : 'first';
        return {
          explanation: `${ptrName} pointer created, pointing to a new Node containing ${newest.data}. head is still null.`,
          changeType: 'node_created',
        };
      }
    }

    // Reachable chain from head
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

    const detachedNodes = currentNodes.filter((n) => n.isDetached);

    // If there is a new detached node created while head is already populated
    if (previousSnapshot) {
      const prevDetached = previousSnapshot.nodes.filter((n) => n.isDetached);
      if (detachedNodes.length > prevDetached.length) {
        const newest = detachedNodes[detachedNodes.length - 1];
        const ptr = pointers.find((p) => p.targetNodeId === newest.id && p.name !== 'head');
        const ptrName = ptr ? ptr.name : 'a new pointer';
        return {
          explanation: `${ptrName} pointer created, pointing to a new Node containing ${newest.data}. It is not yet connected to the list.`,
          changeType: 'node_created',
        };
      }

      // Check if head just changed from null to something
      if (!previousSnapshot.headId && headId) {
        const headNode = currentNodes.find((n) => n.id === headId);
        const otherPtrs = pointers.filter((p) => p.targetNodeId === headId && p.name !== 'head').map((p) => p.name);
        const aliasText = otherPtrs.length > 0
          ? `head points to the node containing ${headNode?.data ?? ''} (aliasing pointer '${otherPtrs.join(', ')}' at address ${headNode?.address ?? ''}).`
          : `head points to the node containing ${headNode?.data ?? ''}.`;
        return {
          explanation: aliasText,
          changeType: 'head_assigned',
        };
      }

      // Check if chain length grew
      const prevChainIds = new Set<string>();
      let prevCurrId: string | null = previousSnapshot.headId;
      while (prevCurrId && !prevChainIds.has(prevCurrId)) {
        prevChainIds.add(prevCurrId);
        const prevFound = previousSnapshot.nodes.find((n) => n.id === prevCurrId);
        if (prevFound) {
          prevCurrId = prevFound.nextId;
        } else {
          break;
        }
      }

      if (chain.length > prevChainIds.size && chain.length > 1) {
        const lastNode = chain[chain.length - 1];
        const prevNode = chain[chain.length - 2];
        if (chain.length === 3 && lastNode.nextId === null) {
          return {
            explanation: `The linked list is complete: head → ${chain.map((n) => n.data).join(' → ')} → nullptr.`,
            changeType: 'final',
          };
        }
        return {
          explanation: `The node containing ${prevNode.data} now points to the node containing ${lastNode.data}.`,
          changeType: 'node_linked',
        };
      }
    }

    // Default summaries based on list length
    if (chain.length === 1) {
      return {
        explanation: `The first node is now connected. head points to the node containing ${chain[0].data}.`,
        changeType: 'head_assigned',
      };
    } else if (chain.length === 2) {
      return {
        explanation: `The first node now points to the second node: head → ${chain[0].data} → ${chain[1].data} → nullptr.`,
        changeType: 'node_linked',
      };
    } else if (chain.length >= 3) {
      return {
        explanation: `The linked list is complete: head → ${chain.map((n) => n.data).join(' → ')} → nullptr.`,
        changeType: 'final',
      };
    }

    return {
      explanation: `Current list: head points to ${chain.length} node(s).`,
      changeType: 'step',
    };
  }
}
