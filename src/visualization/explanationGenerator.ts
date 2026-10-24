import {
  ArrayVariable,
  IndexPointer,
  LinkedListSnapshot,
  ListNode,
  PointerVariable,
  QueueModel,
  StackModel,
  StructureType,
} from './linkedListModel';

export class ExplanationGenerator {
  public static generate(
    currentNodes: ListNode[],
    headId: string | null,
    previousSnapshot?: LinkedListSnapshot,
    hasHead: boolean = true,
    pointers: PointerVariable[] = [],
    printedInStep?: string | null,
    accumulatedOutput?: string,
    structureType: StructureType = 'linked_list',
    activeVisitingNodeId?: string | null,
    currentFuncName?: string,
    arrays: ArrayVariable[] = [],
    indexPointers: IndexPointer[] = [],
    stack?: StackModel,
    queue?: QueueModel
  ): { explanation: string; changeType: LinkedListSnapshot['changeType'] } {
    if (structureType === 'stack') {
      if (!hasHead || !stack) {
        return {
          explanation: 'Program paused at main(). Click Next to initialize the stack.',
          changeType: 'init',
        };
      }

      if (printedInStep) {
        const cleanPrint = printedInStep.replace(/\n$/, '');
        const totalClean = (accumulatedOutput || '').trim();
        const summaryText = totalClean.length > 0 ? ` Program output: ${totalClean}` : '';
        return {
          explanation: `Printed to terminal: "${cleanPrint}".${summaryText}`,
          changeType: 'print',
        };
      }

      if (stack.isOverflow) {
        return {
          explanation: `Stack Overflow! Cannot push: stack '${stack.name}' is already at maximum capacity (${stack.capacity}).`,
          changeType: 'step',
        };
      }

      if (stack.isUnderflow) {
        return {
          explanation: `Stack Underflow! Cannot ${stack.activeMethod || 'pop'}: stack '${stack.name}' is empty.`,
          changeType: 'step',
        };
      }

      if (stack.activeMethod === 'push') {
        const pVal = stack.methodParam !== undefined ? stack.methodParam : (stack.elements[stack.topIndex]?.value ?? '');
        return {
          explanation: `Pushed value ${pVal} onto the stack. Top pointer incremented to index ${stack.topIndex} (${stack.elements.length}/${stack.capacity} elements).`,
          changeType: 'stack_push',
        };
      }

      if (stack.activeMethod === 'pop') {
        const retVal =
          stack.methodReturnValue !== undefined
            ? stack.methodReturnValue
            : (previousSnapshot?.stack?.elements[previousSnapshot.stack.topIndex]?.value ?? '');
        const topDesc = stack.topIndex >= 0 ? `Top pointer moved to index ${stack.topIndex}.` : 'The stack is now empty (top: -1).';
        return {
          explanation: `Popped value ${retVal} from top of the stack. ${topDesc}`,
          changeType: 'stack_pop',
        };
      }

      if (stack.activeMethod === 'peek') {
        const topVal =
          stack.methodReturnValue !== undefined
            ? stack.methodReturnValue
            : (stack.elements[stack.topIndex]?.value ?? 'empty');
        return {
          explanation: `Peeked at top of the stack: value is ${topVal} (top index: ${stack.topIndex}). Stack remains unchanged.`,
          changeType: 'stack_peek',
        };
      }

      const prevStack = previousSnapshot?.stack;
      if (!prevStack || previousSnapshot?.structureType !== 'stack') {
        if (stack.elements.length === 0) {
          return {
            explanation: `Stack '${stack.name}' initialized to empty (top: -1, capacity: ${stack.capacity}).`,
            changeType: 'stack_initialized',
          };
        }
        return {
          explanation: `Initialized stack '${stack.name}' with ${stack.elements.length} element(s). Top index: ${stack.topIndex}.`,
          changeType: 'stack_initialized',
        };
      }

      if (stack.elements.length > prevStack.elements.length) {
        const topElem = stack.elements[stack.topIndex];
        return {
          explanation: `Pushed value ${topElem?.value ?? ''} onto the stack. Top pointer incremented to index ${stack.topIndex}.`,
          changeType: 'stack_push',
        };
      }

      if (stack.elements.length < prevStack.elements.length) {
        const poppedVal = prevStack.elements[prevStack.topIndex]?.value ?? '';
        const topDesc = stack.topIndex >= 0 ? `Top pointer moved to index ${stack.topIndex}.` : 'The stack is now empty (top: -1).';
        return {
          explanation: `Popped value ${poppedVal} from top of the stack. ${topDesc}`,
          changeType: 'stack_pop',
        };
      }

      return {
        explanation: `Stack '${stack.name}' has ${stack.elements.length} element(s). Top is at index ${stack.topIndex}.`,
        changeType: 'step',
      };
    }

    if (structureType === 'queue') {
      if (!hasHead || !queue) {
        return {
          explanation: 'Program paused at main(). Click Next to initialize the circular queue.',
          changeType: 'init',
        };
      }

      if (printedInStep) {
        const cleanPrint = printedInStep.replace(/\n$/, '');
        const totalClean = (accumulatedOutput || '').trim();
        const summaryText = totalClean.length > 0 ? ` Program output: ${totalClean}` : '';
        return {
          explanation: `Printed to terminal: "${cleanPrint}".${summaryText}`,
          changeType: 'print',
        };
      }

      if (queue.isOverflow) {
        return {
          explanation: `Queue Overflow! Cannot enqueue: circular queue '${queue.name}' is full (${queue.size}/${queue.capacity}).`,
          changeType: 'step',
        };
      }

      if (queue.isUnderflow) {
        return {
          explanation: `Queue Underflow! Cannot ${queue.activeMethod || 'dequeue'}: queue '${queue.name}' is empty.`,
          changeType: 'step',
        };
      }

      const prevQueue = previousSnapshot?.queue;
      const isWrapEvent =
        queue.justWrapped ||
        (queue.activeMethod === 'enqueue' && queue.rear === 0 && prevQueue && prevQueue.rear === queue.capacity - 1);

      if (isWrapEvent) {
        const enqVal = queue.methodParam !== undefined ? queue.methodParam : (queue.slots[0]?.value ?? '');
        return {
          explanation: `↺ Circular Queue Wrap-Around! Rear wrapped around: rear = (${queue.capacity - 1} + 1) % ${queue.capacity} = 0. Enqueued value ${enqVal} at front index 0!`,
          changeType: 'queue_wrap',
        };
      }

      if (queue.activeMethod === 'enqueue') {
        const enqVal = queue.methodParam !== undefined ? queue.methodParam : (queue.slots[queue.rear]?.value ?? '');
        return {
          explanation: `Enqueued value ${enqVal} at rear (index ${queue.rear}). Size: ${queue.size}/${queue.capacity}.`,
          changeType: 'queue_enqueue',
        };
      }

      if (queue.activeMethod === 'dequeue') {
        const deqVal =
          queue.methodReturnValue !== undefined
            ? queue.methodReturnValue
            : (prevQueue && prevQueue.front >= 0 ? prevQueue.slots[prevQueue.front]?.value ?? '' : '');
        const frontDesc = queue.size > 0 ? `Front pointer moved to index ${queue.front}.` : 'The queue is now empty (front: -1, rear: -1).';
        return {
          explanation: `Dequeued value ${deqVal} from front. ${frontDesc} Size: ${queue.size}/${queue.capacity}.`,
          changeType: 'queue_dequeue',
        };
      }

      if (queue.activeMethod === 'front') {
        const frontVal =
          queue.methodReturnValue !== undefined
            ? queue.methodReturnValue
            : (queue.front >= 0 ? queue.slots[queue.front]?.value ?? 'empty' : 'empty');
        return {
          explanation: `Inspected front of circular queue: value is ${frontVal} at index ${queue.front}. Queue remains unchanged.`,
          changeType: 'queue_front',
        };
      }

      if (queue.activeMethod === 'rear') {
        const rearVal =
          queue.methodReturnValue !== undefined
            ? queue.methodReturnValue
            : (queue.rear >= 0 ? queue.slots[queue.rear]?.value ?? 'empty' : 'empty');
        return {
          explanation: `Inspected rear of circular queue: value is ${rearVal} at index ${queue.rear}. Queue remains unchanged.`,
          changeType: 'queue_rear',
        };
      }

      if (!prevQueue || previousSnapshot?.structureType !== 'queue') {
        if (queue.size === 0) {
          return {
            explanation: `Circular queue '${queue.name}' initialized to empty (front: -1, rear: -1, capacity: ${queue.capacity}).`,
            changeType: 'queue_initialized',
          };
        }
        return {
          explanation: `Initialized circular queue '${queue.name}' of capacity ${queue.capacity} (size: ${queue.size}).`,
          changeType: 'queue_initialized',
        };
      }

      if (queue.size > prevQueue.size) {
        const val = queue.slots[queue.rear]?.value ?? '';
        return {
          explanation: `Enqueued value ${val} at rear (index ${queue.rear}). Size: ${queue.size}/${queue.capacity}.`,
          changeType: 'queue_enqueue',
        };
      }

      if (queue.size < prevQueue.size) {
        return {
          explanation: `Dequeued element from front. Front is now at index ${queue.front}. Size: ${queue.size}/${queue.capacity}.`,
          changeType: 'queue_dequeue',
        };
      }

      return {
        explanation: `Circular queue '${queue.name}' has ${queue.size} element(s) (front: ${queue.front}, rear: ${queue.rear}).`,
        changeType: 'step',
      };
    }

    if (structureType === 'array') {
      if (!hasHead || arrays.length === 0) {
        return {
          explanation: 'Program paused at main(). Click Next to initialize the array.',
          changeType: 'init',
        };
      }

      if (printedInStep) {
        const cleanPrint = printedInStep.replace(/\n$/, '');
        const totalClean = (accumulatedOutput || '').trim();
        const summaryText = totalClean.length > 0 ? ` Program output: ${totalClean}` : '';
        return {
          explanation: `Printed to terminal: "${cleanPrint}".${summaryText}`,
          changeType: 'print',
        };
      }

      const mainArr = arrays[0];
      const prevArr = previousSnapshot?.arrays?.find(
        (a) => a.name === mainArr.name || a.name.endsWith('.' + mainArr.name) || mainArr.name.endsWith('.' + a.name)
      );

      // Case 1: Initial array creation
      if (!prevArr || !previousSnapshot || !previousSnapshot.arrays || previousSnapshot.arrays.length === 0) {
        const valPreview =
          mainArr.elements.length > 8
            ? `[${mainArr.elements.slice(0, 6).map((e) => e.value).join(', ')}, ...] (${mainArr.size} elements)`
            : `[${mainArr.elements.map((e) => e.value).join(', ')}]`;
        return {
          explanation: `Initialized array '${mainArr.name}' of size ${mainArr.size}: ${valPreview}.`,
          changeType: 'array_initialized',
        };
      }

      // Check all arrays for changes
      for (const arr of arrays) {
        const pArr = previousSnapshot?.arrays?.find(
          (a) => a.name === arr.name || a.name.endsWith('.' + arr.name) || arr.name.endsWith('.' + a.name)
        );
        if (!pArr) continue;

        const changedIndices: number[] = [];
        for (let idx = 0; idx < arr.elements.length; idx++) {
          if (pArr.elements[idx] && pArr.elements[idx].value !== arr.elements[idx].value) {
            changedIndices.push(idx);
          }
        }

        // Case 2: Element swap detection
        if (changedIndices.length === 2) {
          const [i, j] = changedIndices;
          if (
            pArr.elements[i].value === arr.elements[j].value &&
            pArr.elements[j].value === arr.elements[i].value
          ) {
            return {
              explanation: `Swapped elements ${arr.name}[${i}] (${arr.elements[i].value}) and ${arr.name}[${j}] (${arr.elements[j].value}).`,
              changeType: 'array_element_swapped',
            };
          }
        }

        // Case 3: Single element update
        if (changedIndices.length === 1) {
          const idx = changedIndices[0];
          const oldVal = pArr.elements[idx]?.value;
          const newVal = arr.elements[idx].value;
          return {
            explanation: `Updated ${arr.name}[${idx}] from ${oldVal} to ${newVal} (${arr.name}[${idx}] = ${newVal}).`,
            changeType: 'array_element_updated',
          };
        } else if (changedIndices.length > 2) {
          return {
            explanation: `Updated ${changedIndices.length} elements in array '${arr.name}'.`,
            changeType: 'array_element_updated',
          };
        }
      }

      // Case 4: Index pointer movement (e.g. i moved from 1 to 2)
      if (previousSnapshot?.indexPointers) {
        for (const currPtr of indexPointers) {
          const prevPtr = previousSnapshot.indexPointers.find((p) => p.name === currPtr.name);
          if (prevPtr && prevPtr.targetIndex !== currPtr.targetIndex) {
            const targetArr = arrays.find((a) => a.name === currPtr.targetArrayName) || mainArr;
            const elemVal = targetArr.elements[currPtr.targetIndex]?.value;
            const valInfo = elemVal !== undefined ? ` (value: ${elemVal})` : '';
            return {
              explanation: `Index pointer '${currPtr.name}' moved to index ${currPtr.targetIndex}${valInfo}.`,
              changeType: 'array_pointer_moved',
            };
          }
        }
      }

      const defaultPreview =
        mainArr.elements.length > 8
          ? `[${mainArr.elements.slice(0, 6).map((e) => e.value).join(', ')}, ...] (${mainArr.size} elements)`
          : `[${mainArr.elements.map((e) => e.value).join(', ')}]`;

      return {
        explanation: `Array '${mainArr.name}' state: ${defaultPreview}.`,
        changeType: 'step',
      };
    }

    if (structureType === 'tree') {
      if (!hasHead) {
        return {
          explanation: 'Program paused at main(). Click Next to execute: TreeNode* root = nullptr;',
          changeType: 'init',
        };
      }

      // Check if the executed step printed output to terminal
      if (printedInStep) {
        const cleanPrint = printedInStep.replace(/\n$/, '');
        const totalClean = (accumulatedOutput || '').trim();
        const summaryText = totalClean.length > 0 ? ` Program output: ${totalClean}` : '';
        return {
          explanation: `Printed to terminal: "${cleanPrint}".${summaryText}`,
          changeType: 'print',
        };
      }

      const prevNodes = previousSnapshot?.nodes || [];

      // Check for New Tree Node Creation / Linking
      if (previousSnapshot) {
        const newNodes = currentNodes.filter((c) => !prevNodes.some((p) => p.id === c.id));
        if (newNodes.length > 0) {
          const newest = newNodes[newNodes.length - 1];
          const parent = currentNodes.find((n) => n.leftId === newest.id || n.rightId === newest.id);
          if (parent) {
            const isLeft = parent.leftId === newest.id;
            return {
              explanation: `Node containing ${newest.data} inserted as ${isLeft ? 'LEFT' : 'RIGHT'} child of node ${parent.data}.`,
              changeType: 'tree_child_linked',
            };
          } else if (newest.id === headId) {
            return {
              explanation: `Tree root initialized to node containing ${newest.data}.`,
              changeType: 'tree_root_assigned',
            };
          } else {
            return {
              explanation: `Created new tree node containing ${newest.data}.`,
              changeType: 'tree_node_created',
            };
          }
        }
      }

      // Check for Traversal Visit
      if (activeVisitingNodeId) {
        const visitingNode = currentNodes.find((n) => n.id === activeVisitingNodeId);
        if (visitingNode) {
          const fnInfo = currentFuncName ? ` in ${currentFuncName}()` : '';
          return {
            explanation: `Visiting tree node containing ${visitingNode.data}${fnInfo}.`,
            changeType: 'tree_traversal_visit',
          };
        }
      }

      // Initial tree state
      if (currentNodes.length === 0) {
        return {
          explanation: 'root is initialized to nullptr. The tree is currently empty.',
          changeType: 'init',
        };
      }

      if (headId) {
        const rootNode = currentNodes.find((n) => n.id === headId);
        return {
          explanation: `Binary tree with root containing ${rootNode?.data ?? ''} (${currentNodes.length} node${currentNodes.length > 1 ? 's' : ''}).`,
          changeType: 'step',
        };
      }

      return {
        explanation: `Binary tree state updated (${currentNodes.length} node${currentNodes.length > 1 ? 's' : ''}).`,
        changeType: 'step',
      };
    }

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
        currId = found.nextId ?? null;
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
        if (currPtr.name === 'head' || currPtr.name === 'root') continue;
        const prevPtr = previousSnapshot.pointers?.find((p) => p.name === currPtr.name);
        if (prevPtr && prevPtr.targetNodeId !== currPtr.targetNodeId) {
          if (currPtr.isNull || !currPtr.targetNodeId) {
            const nullMsg = `Pointer '${currPtr.name}' updated to nullptr (reached end of list).`;
            return {
              explanation: nullMsg,
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
