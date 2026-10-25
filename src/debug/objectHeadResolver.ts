export interface RuntimeVariable {
  name: string;
  value: string;
  type?: string;
  variablesReference: number;
}

export function isNodePointerType(type: string, nodeType: string): boolean {
  const name = type.replace(/\b(?:const|volatile|struct|class)\b|[*&]/g, '').trim();
  return type.includes('*') && (name === nodeType || name.endsWith('::' + nodeType));
}

export function isExplicitNull(value: string): boolean {
  return /^(?:\([^)]*\)\s*)?(?:0x0+|0|nullptr|NULL|\(nil\))$/.test(value.trim());
}

/** Resolve container-owned heads without interpreting the container as a node. */
export async function resolveObjectHead(
  variables: RuntimeVariable[],
  nodeType: string,
  recordTypes: Set<string>,
  memberNames: string[],
  children: (reference: number) => Promise<RuntimeVariable[]>,
  evaluate: (expression: string) => Promise<string | null>,
  parsePointer: (value: string) => string | null,
): Promise<{ address: string | null } | undefined> {
  const readPointer = (value: string): { address: string | null } | undefined => {
    const address = parsePointer(value);
    return address ? { address } : isExplicitNull(value) ? { address: null } : undefined;
  };
  const visited = new Set<number>();
  const inspectMembers = async (reference: number, depth = 0): Promise<{ address: string | null } | undefined> => {
    if (reference <= 0 || visited.has(reference) || depth > 3) return undefined;
    visited.add(reference);
    let fields: RuntimeVariable[];
    try { fields = (await children(reference)).slice(0, 64); } catch { return undefined; }
    const rank = (field: RuntimeVariable) => {
      const position = memberNames.indexOf(field.name);
      return position < 0 ? memberNames.length : position;
    };
    for (const field of [...fields].sort((a, b) => rank(a) - rank(b))) {
      if (field.type ? isNodePointerType(field.type, nodeType) : memberNames.includes(field.name)) {
        const result = readPointer(field.value);
        if (result) return result;
      }
    }
    // Debug adapters may put private members behind synthetic access groups.
    for (const field of fields) {
      if (/^(?:private|protected|public)\s*:?$|^\[.*\]$|^<.*>$/i.test(field.name)) {
        const result = await inspectMembers(field.variablesReference, depth + 1);
        if (result) return result;
      }
    }
    return undefined;
  };

  for (const variable of variables) {
    const type = (variable.type || '').replace(/\b(?:const|volatile|struct|class)\b|[*&]/g, '').trim();
    if (!recordTypes.has(type) || isNodePointerType(variable.type || '', nodeType) || type === nodeType) continue;
    const expanded = await inspectMembers(variable.variablesReference);
    if (expanded) return expanded;
    if (!/^[a-zA-Z_]\w*$/.test(variable.name)) continue;
    const access = (variable.type || '').includes('*') ? '->' : '.';
    for (const member of memberNames) {
      const value = await evaluate(`${variable.name}${access}${member}`);
      if (value !== null) {
        const result = readPointer(value);
        if (result) return result;
      }
    }
  }
  return undefined;
}
