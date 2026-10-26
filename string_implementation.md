# Extensive Implementation Plan: Strings Data Structure Integration

## Executive Summary
This document provides an end-to-end technical blueprint for integrating the **Strings data structure** (`std::string`, `char[]`, `char*`, C-style strings) into Simide. 

Just like Simide's existing support for Linked Lists, Binary Search Trees, Stacks, Queues, Arrays, and Graphs, Strings will be treated as a first-class pedagogical data structure featuring:
1. **Zero-Overhead DAP Extraction**: Extracting entire strings in a single DAP roundtrip (`s.c_str()` or `value` inspector) instead of serial per-character queries.
2. **Pedagogical Representation**: Visualizing characters with both glyphs (`'a'`) and ASCII/Unicode values (`97`), explicit null terminator (`'\0'`) slots for C-strings, and active pointer badges (`left`, `right`, `i`, `j`).
3. **Algorithm Awareness**: Native visualization for classic interview patterns: Two-Pointer Reversals, Palindrome Checks, and Sliding Windows.

---

## 1. Architectural Overview & Component Impact

```mermaid
graph TD
    A[C++ Source Code<br/>std::string / char s[]] --> B[SourceAnalysisCache<br/>Discover String Decls & Patterns]
    B --> C[StateExtractor<br/>Single-Roundtrip String Extraction]
    D[DAP Session / GDB] --> C
    C --> E[LinkedListSnapshot<br/>structureType: 'string'<br/>StringVariable & IndexPointers]
    E --> F[ExplanationGenerator<br/>Pedagogical String Explanations]
    E --> G[Webview app.ts<br/>renderStringView & Two-Pointer Badges]
    F --> H[UI: Visual Canvas + Pedagogical Step Log]
    G --> H
```

---

## 2. Target Files & Touchpoints

| File | Subsystem | Responsibility |
| :--- | :--- | :--- |
| `src/visualization/linkedListModel.ts` | Data Models | Add `'string'` to `StructureType`, declare `StringVariable`, `StringElement`, `StringWindow`. |
| `src/debug/sourceAnalysisCache.ts` | Source Analyzer | Single-pass regex & AST discovery for `std::string`, `char[]`, `char*` declarations. |
| `src/debug/stateExtractor.ts` | DAP Extraction Engine | Single-roundtrip string value parsing, length/capacity discovery, index pointer resolution. |
| `src/visualization/explanationGenerator.ts` | Pedagogical Explanation | Character mutations, two-pointer swaps, palindrome checks, sliding window explanations. |
| `webview/app.ts` | Webview Visualizer | `renderStringView`: character boxes, ASCII sub-labels, `\0` terminator slot, window brackets. |
| `webview/styles.css` | UI Styles | Premium styling for string character ribbons, sliding window overlays, and pointer badges. |
| `test/stringExtraction.test.ts` | Verification | Full mock DAP & real GDB test suite across `std::string` and `char[]`. |

---

## 3. Phased Implementation Roadmap

---

### Phase 1: Data Model & Type System Foundation

#### Objective
Define the TypeScript data models representing string variables, character elements, sliding windows, and string-specific change types in `src/visualization/linkedListModel.ts`.

#### Detailed Tasks

1. **Extend `StructureType`**:
   ```ts
   export type StructureType = 'linked_list' | 'tree' | 'array' | 'stack' | 'queue' | 'string' | 'graph';
   ```

2. **Define String Element & Variable Interfaces**:
   ```ts
   export interface StringElement {
     index: number;
     char: string;             // e.g. "a", "\0", " "
     ascii: number;            // e.g. 97, 0, 32
     isModified?: boolean;     // Highlighted if changed this step
     isCompared?: boolean;     // Highlighted if involved in comparison (e.g. s[i] == s[j])
     isWindow?: boolean;       // Inside current sliding window [start..end]
     isNullTerminator?: boolean; // True for '\0'
     address?: string;         // Memory address of character slot
   }

   export interface StringVariable {
     name: string;             // e.g. "s", "str", "haystack"
     type: 'std_string' | 'char_array' | 'char_pointer';
     length: number;           // Actual character count (excluding \0 for std::string)
     capacity?: number;        // std::string capacity or allocated buffer size
     elements: StringElement[];
     address?: string;
     hasNullTerminator: boolean;
   }

   export interface StringWindow {
     stringName: string;
     startIndex: number;
     endIndex: number;
     label?: string;           // e.g. "current window" or "match"
   }
   ```

3. **Extend `LinkedListSnapshot` & `ChangeType`**:
   ```ts
   // In ChangeType:
   | 'string_initialized'
   | 'string_char_updated'
   | 'string_char_swapped'
   | 'string_pointer_moved'
   | 'string_window_resized'
   | 'string_concatenated'

   // In LinkedListSnapshot:
   strings?: StringVariable[];
   stringWindows?: StringWindow[];
   ```

---

### Phase 2: Static Source Analysis & Pattern Detection

#### Objective
Extend `SourceAnalysisCache` in `src/debug/sourceAnalysisCache.ts` to discover string variables, their storage type (stack array vs `std::string`), and algorithm patterns in a single pass.

#### Detailed Tasks

1. **String Declaration Discovery (`discoverStringDeclarations`)**:
   - Detect `std::string` and `string` variables:
     ```cpp
     std::string s = "hello";
     string word;
     ```
   - Detect C-style fixed character arrays:
     ```cpp
     char str[50] = "world";
     char buf[] = "test";
     ```
   - Detect dynamic/pointer character strings:
     ```cpp
     char* p = new char[20];
     const char* msg = "read-only";
     ```

2. **Algorithm Pattern Heuristics**:
   - **Two-Pointer Reversal/Palindrome**: Detect index pointers `left`/`right`, `start`/`end`, `i`/`j` converging (`left < right`, `while(i < j)`).
   - **Sliding Window**: Detect window pointers `left`/`right` or `windowStart`/`windowEnd` accompanied by a `count` or frequency array (`int count[256]`).

---

### Phase 3: High-Performance DAP Runtime Extraction Engine

#### Objective
Extract string states with minimal DAP roundtrips, reusing Phase 2 and Phase 3 batched evaluation techniques to avoid per-character DAP requests.

#### Detailed Tasks

1. **Single-Roundtrip String Fetching**:
   - In GDB, evaluating a `std::string` or `char*` directly yields its formatted value:
     ```
     s = "racecar"
     s = {static npos = 18446744073709551615, _M_dataplus = {<std::allocator<char>> = ...}, _M_string_length = 7}
     ```
   - Use `await evalExpr(varName)`:
     - If it returns `"racecar"`, parse the string content directly in **1 roundtrip**!
     - Fallback for complex libstdc++ representations: `await evalExpr(\`${varName}.c_str()\`)` or `await evalExpr(\`${varName}.size()\`)`.

2. **C-Style Character Array Traversal**:
   - For `char arr[10] = "hi"`, fetch the buffer string via `evalExpr((char*)arr)`.
   - Build elements:
     - Indices `0` and `1`: `'h'`, `'i'`
     - Index `2`: `'\0'` (`isNullTerminator: true`)
     - Trailing slots up to declared capacity (optional display of unallocated buffer).

3. **Active Index Pointer Association**:
   - Re-use the `extractIndexPointers` pipeline:
     - Search local integer variables (`i`, `j`, `left`, `right`, `start`, `end`, `k`, `idx`).
     - Check bounds `0 <= targetIndex < s.length + (hasNullTerminator ? 1 : 0)`.
     - Link `targetArrayName: varName`.

4. **In-Place Mutation & Swap Detection**:
   - Compare current snapshot with `previousSnapshot.strings`:
     - If exactly 1 character index changed: mark `isModified = true`, set changeType `'string_char_updated'`.
     - If exactly 2 characters swapped positions (e.g. `s[0] <-> s[6]`): mark both as swapped, set changeType `'string_char_swapped'`.

---

### Phase 4: Pedagogical Explanation Engine

#### Objective
Generate clear, instructional step-by-step pedagogical explanations in `src/visualization/explanationGenerator.ts` for student comprehension.

#### Explanation Scenarios:
1. **Initialization**:
   - `"Initialized string 's' with \"racecar\" (length: 7)."`
   - `"Allocated character array 'str' of capacity 20, containing \"hello\" followed by null terminator '\\0'."`
2. **Two-Pointer Movements**:
   - `"Pointers 'left' (index 0, 'r') and 'right' (index 6, 'r') comparing matching characters."`
   - `"Pointer 'left' advanced to index 1 ('a'); pointer 'right' moved inward to index 5 ('a')."`
3. **In-Place Mutation & Swapping**:
   - `"Swapped characters s[0] ('r') and s[4] ('o') during in-place string reversal."`
   - `"Assigned 'x' to s[2] (data updated: 'c' → 'x')."`
4. **Sliding Window**:
   - `"Window [left=0..right=3] expanded to include character 'd': substring is \"abcd\"."`
   - `"Duplicate character 'a' encountered at index 4! Shrinking window start from index 0 to 1."`
5. **Null Terminator Encountered**:
   - `"Encountered null terminator '\\0' at index 5. String traversal loop terminates."`

---

### Phase 5: Webview UI & Canvas Visualization

#### Objective
Design a dedicated, responsive string visualization component in `webview/app.ts` and `webview/styles.css`.

#### Visual Design Specifications:
1. **String Ribbon Container**:
   - Horizontal flexbox ribbon of character tiles with smooth entry transitions.
   - Clean variable label badge: `• s (std::string, length: 7)`
2. **Character Tiles (`.string-char-cell`)**:
   - Primary glyph: Large, clean monospaced font (e.g. `'a'`, `'B'`, `'7'`).
   - Secondary subscript: Small muted ASCII code (e.g. `97`, `66`, `55`) to help students learning ASCII manipulations (e.g. `c - 'a'`).
   - Index badge below cell: `[0]`, `[1]`, `[2]`.
3. **Special Null Terminator Tile (`.string-null-cell`)**:
   - Visual styling: Dotted amber border, subtle `\0` symbol, distinct from standard spaces.
4. **Two-Pointer Badges & Floating Indicators**:
   - Floating badge above character cells (`left` blue badge with downward arrow, `right` purple badge with downward arrow).
5. **Sliding Window Bracket**:
   - Glowing bounding box or horizontal bracket beneath cells encompassing `[left..right]`.

---

### Phase 6: Test Suite & Example Fixtures

#### Objective
Ensure 100% test pass rate with both unit tests (mock DAP) and real GDB stepping tests.

#### New Example Programs (`examples/`):
1. `examples/string-reverse.cpp`: In-place string reversal using two pointers and `std::swap`.
2. `examples/string-palindrome.cpp`: Two-pointer palindrome check (`left`, `right`).
3. `examples/sliding-window-string.cpp`: Longest substring without repeating characters using sliding window.
4. `examples/c-string-traversal.cpp`: Pointer-chasing C-string traversal until `*ptr == '\0'`.

#### Test Suites:
- `test/stringExtraction.test.ts`: Verify `extractStrings`, character elements, two-pointer discovery, and mutation diffing.
- Integration with `test/runAll.js`.

---

## 4. Verification Gate & Acceptance Criteria

- [x] Phase 1: Data Model & Type System Foundation (`StructureType`, `StringVariable`, `StringElement`, `StringWindow`, `ChangeType`).
- [ ] Phase 2: Static Source Analysis & Pattern Detection (`discoverStringDeclarations`).
- [ ] Phase 3: High-Performance DAP Runtime Extraction Engine (`extractStrings`).
- [ ] Phase 4: Pedagogical Explanation Engine (`generateStringExplanation`).
- [ ] Phase 5: Webview UI & Canvas Visualization (`renderStringDiagram`).
- [ ] Phase 6: Test Suite & Example Fixtures (`examples/string-*.cpp`, `test/stringExtraction.test.ts`).

---

## 5. Implementation Progress Tracker

| Task | Description | Status |
| :--- | :--- | :--- |
| `1.1` | Add `'string'` to `StructureType` | Completed |
| `1.2` | Define `StringElement`, `StringVariable`, `StringWindow` | Completed |
| `1.3` | Extend `ChangeType` with string mutation/pointer actions | Completed |
| `1.4` | Extend `LinkedListSnapshot` with `strings` & `stringWindows` | Completed |
| `2.1` | Implement `discoverStringDeclarations` in `SourceAnalysisCache` | Pending |
| `2.2` | Implement string algorithm pattern heuristics (two-pointer, sliding window) | Pending |
| `3.1` | Implement single-roundtrip string value fetching (`evalExpr(varName)`) | Pending |
| `3.2` | Implement C-style character buffer extraction with `\0` detection | Pending |
| `3.3` | Map active index pointers (`i`, `j`, `left`, `right`) to string elements | Pending |
| `3.4` | Implement character mutation & in-place swap detection | Pending |
| `4.1` | Generate pedagogical explanations for string lifecycle and operations | Pending |
| `5.1` | Create `renderStringDiagram` component in `webview/app.ts` | Pending |
| `5.2` | Implement character tiles, ASCII sub-labels, and `\0` null cell styling | Pending |
| `5.3` | Implement sliding window highlight bracket and two-pointer badges | Pending |
| `6.1` | Create string algorithm example programs in `examples/` | Pending |
| `6.2` | Add comprehensive unit tests in `test/stringExtraction.test.ts` | Pending |
| `6.3` | Verify full test suite pass rate with `npm test` | Pending |
