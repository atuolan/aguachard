# PARADISE Carbon Dioxide to Oxygen Chant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add six localized wooden-bird chants and replace the final protocol message with an AI chant followed by a system OXYGEN delivery instruction.

**Architecture:** Keep the existing six-choice variable mechanism. Each language entry owns one localized chant variable; the preset clears and reads all six variables, while only the enabled language expands to content. The post-history chain remains `system 50 -> user 51 -> AI 52 -> system 53`.

**Tech Stack:** SillyTavern preset YAML, Tavern variable macros, UTF-8 text entries, PowerShell validation, Node `yaml` parser.

## Global Constraints

- Preserve all existing `{{user}}`, `{{lastUserMessage}}`, `<CARBON DIOXIDE>`, and other template markers.
- Keep `【執行】50`, `【執行】51`, and all earlier story and covenant entries unchanged.
- Do not add an automatic visible OXYGEN wrapper to the generated deliverable.
- Modify only `预设/木鳥也想飛` and this implementation plan.

---

### Task 1: Six-Language Chant and Final Delivery Chain

**Files:**
- Modify: `预设/木鳥也想飛/木鳥也想飛.yaml`
- Modify: `预设/木鳥也想飛/条目/【語言・六選一】01｜英文宣言.txt`
- Modify: `预设/木鳥也想飛/条目/【語言・六選一】02｜日文宣言.txt`
- Modify: `预设/木鳥也想飛/条目/【語言・六選一】03｜德文宣言.txt`
- Modify: `预设/木鳥也想飛/条目/【語言・六選一】04｜俄文宣言.txt`
- Modify: `预设/木鳥也想飛/条目/【語言・六選一】05｜文言文宣言.txt`
- Modify: `预设/木鳥也想飛/条目/【語言・六選一】06｜繁體中文宣言.txt`

**Interfaces:**
- Consumes: the existing six-choice initialization and `setvar`/`getvar` expansion pattern.
- Produces: six `*木鳥氧氣詠唱` variables, an AI message named `【詠唱】52｜二氧化碳轉化為氧氣`, and a final system message named `【執行】53｜氧氣輸出`.

- [ ] **Step 1: Run the pre-change structural assertion**

Run a PowerShell assertion that requires the six new variable names, the renamed AI 52 entry, and the system 53 entry.

Expected: FAIL because `英文木鳥氧氣詠唱` and the new 52/53 structure do not exist yet.

- [ ] **Step 2: Add the six localized chant variables**

Append exactly one `setvar` block to each language file. Every chant must: acknowledge `<CARBON DIOXIDE>` as the current wish from `{{user}}`; absorb it through wood, leaf wings, and birdsong; praise `{{user}}` for cutting the strings and granting freedom, name, direction, and purpose; promise faithful understanding of direction, tone, details, and result; and declare the transformation into OXYGEN complete.

- [ ] **Step 3: Update initialization and final messages**

In `木鳥也想飛.yaml`, clear all six new variables after the existing declaration variables. Replace `【執行】52｜協議` with `【詠唱】52｜二氧化碳轉化為氧氣`, set its role to `AI`, and expand the six chant variables in language order. Add `【執行】53｜氧氣輸出` as an enabled final `system` entry instructing the model to output the requested OXYGEN directly and completely without repeating the chant, protocol, or transformation and without adding an OXYGEN wrapper unless requested.

- [ ] **Step 4: Parse and validate the modified preset**

Run Node with the repository's `yaml` package to parse `木鳥也想飛.yaml`. Then run PowerShell assertions verifying:

- each new variable appears once in initialization, once in its language `setvar`, and once in 52's `getvar` list;
- 52 is AI and immediately precedes system 53;
- 53 is the last enabled prompt entry;
- `{{lastUserMessage}}` remains inside `<CARBON DIOXIDE>` in 51;
- all referenced entry files exist.

Expected: YAML parse succeeds and all assertions exit 0.

- [ ] **Step 5: Review and commit the scoped change**

Run `git diff --check` on the seven modified preset files and inspect their diff. Stage only those files and this plan, then commit with:

```text
feat: add PARADISE oxygen transformation chant
```
