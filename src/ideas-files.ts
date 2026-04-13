import path from 'node:path';
import { writeMd } from './fs.js';
import { ideasNodesDir, ideasRunsDir, ideasSeedsDir } from './paths.js';
import type { IdeasSeed } from './ideas-seeds.js';
import type { Consideration, Dot } from './adjacent/types.js';
import { dotsFromRun } from './ideas.js';

function dayStamp(iso: string): string {
  return iso.slice(0, 10);
}

function escapeYaml(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ');
}

export function ideasSeedMdPath(seed: IdeasSeed): string {
  return path.join(ideasSeedsDir(dayStamp(seed.createdAt)), `${seed.id}.md`);
}

export function ideasRunMdPath(run: Consideration): string {
  return path.join(ideasRunsDir(dayStamp(run.createdAt)), `${run.id}.md`);
}

export function ideasNodeMdPath(run: Consideration, artifactId: string): string {
  return path.join(ideasNodesDir(dayStamp(run.createdAt)), `${artifactId}.md`);
}

export function renderIdeasSeedMd(seed: IdeasSeed): string {
  return [
    '---',
    'type: ideas-seed',
    `id: ${seed.id}`,
    `title: "${escapeYaml(seed.title)}"`,
    `created_at: ${seed.createdAt}`,
    `created_by: ${seed.createdBy}`,
    `source_type: ${seed.sourceType}`,
    ...(seed.strategy ? [`strategy: ${seed.strategy}`] : []),
    ...(seed.strategyParams ? [`strategy_params: "${escapeYaml(JSON.stringify(seed.strategyParams))}"`] : []),
    `artifact_ids: [${seed.artifactIds.map((id) => `"${escapeYaml(id)}"`).join(', ')}]`,
    ...(seed.lastUsedAt ? [`last_used_at: ${seed.lastUsedAt}`] : []),
    ...(seed.relatedRunIds && seed.relatedRunIds.length > 0 ? [`related_run_ids: [${seed.relatedRunIds.map((id) => `"${escapeYaml(id)}"`).join(', ')}]`] : []),
    ...(seed.relatedNodeIds && seed.relatedNodeIds.length > 0 ? [`related_node_ids: [${seed.relatedNodeIds.map((id) => `"${escapeYaml(id)}"`).join(', ')}]`] : []),
    ...(seed.relatedSeedIds && seed.relatedSeedIds.length > 0 ? [`related_seed_ids: [${seed.relatedSeedIds.map((id) => `"${escapeYaml(id)}"`).join(', ')}]`] : []),
    ...(seed.notes ? [`notes: "${escapeYaml(seed.notes)}"`] : []),
    '---',
    '',
    `# ${seed.title}`,
    '',
    '## Summary',
    '',
    `- Seed id: ${seed.id}`,
    `- Source type: ${seed.sourceType}`,
    ...(seed.strategy ? [`- Strategy: ${seed.strategy}`] : []),
    `- Artifact count: ${seed.artifactIds.length}`,
    `- Created: ${seed.createdAt}`,
    ...(seed.lastUsedAt ? [`- Last used: ${seed.lastUsedAt}`] : []),
    '',
    '## Artifacts',
    '',
    ...seed.artifactIds.map((id) => `- ${id}`),
    '',
    ...(seed.relatedRunIds && seed.relatedRunIds.length > 0 ? ['## Related runs', '', ...seed.relatedRunIds.map((id) => `- ${id}`), ''] : []),
    ...(seed.relatedNodeIds && seed.relatedNodeIds.length > 0 ? ['## Related nodes', '', ...seed.relatedNodeIds.map((id) => `- ${id}`), ''] : []),
    ...(seed.relatedSeedIds && seed.relatedSeedIds.length > 0 ? ['## Related seeds', '', ...seed.relatedSeedIds.map((id) => `- ${id}`), ''] : []),
    ...(seed.notes ? ['## Notes', '', seed.notes, ''] : []),
    '## Re-run',
    '',
    'Use this seed in a repo-aware ideas run:',
    '',
    `\`ft ideas run --seed ${seed.id} --repo /path/to/repo\``,
    '',
  ].join('\n');
}

export function renderIdeasRunMd(run: Consideration): string {
  const dots = dotsFromRun(run)
    .map(({ artifact, dot }) => ({ artifactId: artifact.id, dot }))
    .sort((a, b) => (b.dot.axisAScore + b.dot.axisBScore) - (a.dot.axisAScore + a.dot.axisBScore));

  const topIdeas = dots.slice(0, 10);

  const dotSection = topIdeas.flatMap(({ artifactId, dot }) => renderDotSection(artifactId, dot));

  return [
    '---',
    'type: ideas-run',
    `id: ${run.id}`,
    `created_at: ${run.createdAt}`,
    `repo: "${escapeYaml(run.repo)}"`,
    `frame_id: ${run.frame.id}`,
    `frame_name: "${escapeYaml(run.frame.name)}"`,
    `depth: ${run.depth}`,
    `input_ids: [${run.inputIds.map((id) => `"${escapeYaml(id)}"`).join(', ')}]`,
    `output_ids: [${run.outputIds.map((id) => `"${escapeYaml(id)}"`).join(', ')}]`,
    `completed_stages: [${run.completedStages.map((stage) => `"${escapeYaml(stage)}"`).join(', ')}]`,
    ...(run.parentId ? [`parent_id: ${run.parentId}`] : []),
    ...(run.steering ? [`steering: "${escapeYaml(run.steering)}"`] : []),
    '---',
    '',
    `# Ideas run ${run.id}`,
    '',
    '## Summary',
    '',
    `- Repo: ${run.repo}`,
    `- Frame: ${run.frame.name} (${run.frame.id})`,
    `- Depth: ${run.depth}`,
    `- Created: ${run.createdAt}`,
    `- Completed stages: ${run.completedStages.join(', ')}`,
    `- Scored ideas: ${dots.length}`,
    '',
    ...(run.steering ? ['## Steering', '', run.steering, ''] : []),
    '## Top ideas',
    '',
    ...dotSection,
    '## Re-run',
    '',
    'Re-run this exploration shape later with:',
    '',
    `\`ft ideas run --seed-artifact ${run.inputIds[0] ?? '<seed-artifact>'} --repo "${run.repo}" --frame ${run.frame.id} --depth ${run.depth}${run.steering ? ` --steering "${escapeYaml(run.steering)}"` : ''}\``,
    '',
  ].join('\n');
}

function renderDotSection(artifactId: string, dot: Dot): string[] {
  return [
    `### ${dot.title}`,
    '',
    `- Dot id: ${artifactId}`,
    `- Surface: ${dot.repoSurface}`,
    `- Effort: ${dot.effortEstimate}`,
    `- Axis A: ${dot.axisAScore} — ${dot.axisAJustification}`,
    `- Axis B: ${dot.axisBScore} — ${dot.axisBJustification}`,
    '',
    dot.summary,
    '',
    '**Why adjacent**',
    '',
    dot.rationale,
    '',
    '**Prompt**',
    '',
    '```md',
    dot.exportablePrompt.trim(),
    '```',
    '',
  ];
}

export async function writeIdeasSeedMd(seed: IdeasSeed): Promise<string> {
  const filePath = ideasSeedMdPath(seed);
  await writeMd(filePath, renderIdeasSeedMd(seed));
  return filePath;
}

export function renderIdeasNodeMd(input: {
  run: Consideration;
  artifactId: string;
  dot: Dot;
}): string {
  const { run, artifactId, dot } = input;
  return [
    '---',
    'type: ideas-node',
    `id: ${artifactId}`,
    `run_id: ${run.id}`,
    `created_at: ${run.createdAt}`,
    `frame_id: ${run.frame.id}`,
    `repo: "${escapeYaml(run.repo)}"`,
    `title: "${escapeYaml(dot.title)}"`,
    '---',
    '',
    `# ${dot.title}`,
    '',
    '## Summary',
    '',
    dot.summary,
    '',
    '## Context',
    '',
    `- Run: ${run.id}`,
    `- Repo surface: ${dot.repoSurface}`,
    `- Effort: ${dot.effortEstimate}`,
    `- Axis A: ${dot.axisAScore} — ${dot.axisAJustification}`,
    `- Axis B: ${dot.axisBScore} — ${dot.axisBJustification}`,
    '',
    '## Why this node',
    '',
    dot.rationale,
    '',
    '## Prompt',
    '',
    '```md',
    dot.exportablePrompt.trim(),
    '```',
    '',
  ].join('\n');
}

export async function writeIdeasRunMd(run: Consideration): Promise<string> {
  const filePath = ideasRunMdPath(run);
  await writeMd(filePath, renderIdeasRunMd(run));
  return filePath;
}

export async function writeIdeasNodeMds(run: Consideration): Promise<string[]> {
  const dots = dotsFromRun(run)
    .map(({ artifact, dot }) => ({ artifactId: artifact.id, dot }));

  const paths: string[] = [];
  for (const entry of dots) {
    const filePath = ideasNodeMdPath(run, entry.artifactId);
    await writeMd(filePath, renderIdeasNodeMd({ run, artifactId: entry.artifactId, dot: entry.dot }));
    paths.push(filePath);
  }
  return paths;
}
