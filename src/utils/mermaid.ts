import type { Step, Flow } from '../models/schemas';

export function agentToMermaid(steps: Step[], flows?: Flow[]): string {
  const lines: string[] = [];
  lines.push('flowchart TD');
  // optional: group by flow
  const flowMap = new Map<string, Step[]>();
  const noFlow: Step[] = [];
  for (const s of steps) {
    if (s.flow_id) {
      const arr = flowMap.get(s.flow_id) || [];
      arr.push(s);
      flowMap.set(s.flow_id, arr);
    } else noFlow.push(s);
  }
  // Nodes
  function addNode(s: Step) {
    const label = `${s.step_id}`;
    lines.push(`  ${s.step_id}([${escapeLabel(label)}])`);
  }
  // Ungrouped
  for (const s of noFlow) addNode(s);
  // Grouped by flow
  for (const [fid, group] of flowMap) {
    lines.push(`  subgraph ${fid}`);
    for (const s of group) addNode(s);
    lines.push('  end');
  }
  // Edges
  for (const s of steps) {
    for (const r of s.routes || []) {
      lines.push(`  ${s.step_id} -->|${escapeLabel(r.condition)}| ${r.target}`);
    }
  }
  // Tools as notes
  for (const s of steps) {
    if (s.available_tools && s.available_tools.length) {
      const noteId = `${s.step_id}_tools`;
      const tools = s.available_tools.join(', ');
      lines.push(`  ${noteId}(["tools: ${escapeLabel(tools)}"]):::note`);
      lines.push(`  ${s.step_id} -.-> ${noteId}`);
    }
  }
  // Styles
  lines.push('  classDef note fill:#222b,stroke:#666,stroke-dasharray: 2 2,color:#ddd;');
  return lines.join('\n');
}

function escapeLabel(s: string): string {
  return s.replace(/"/g, '\\"');
}

