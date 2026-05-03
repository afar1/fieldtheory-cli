import path from 'node:path';
import { writeMd } from './fs.js';
import { ideasBatchesDir, ideasNodesDir, ideasRunsDir, ideasSeedsDir } from './paths.js';
import type { IdeasSeed } from './ideas-seeds.js';
import type { Consideration, Dot } from './adjacent/types.js';
import { dotsFromRun, type IdeasBatchSummary } from './ideas.js';

function dayStamp(iso: string): string {
  return iso.slice(0, 10);
}

function escapeYaml(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ');
}

function renderRunProfileFlags(profile: {
  engine?: string;
  engineModel?: string;
  engineEffort?: string;
}): string {
  return [
    ...(profile.engine ? [` --engine "${escapeYaml(profile.engine)}"`] : []),
    ...(profile.engineModel ? [` --model "${escapeYaml(profile.engineModel)}"`] : []),
    ...(profile.engineEffort ? [` --effort "${escapeYaml(profile.engineEffort)}"`] : []),
  ].join('');
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
    ...(seed.frameId ? [`frame_id: ${seed.frameId}`] : []),
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
    ...(seed.frameId ? [`- Frame: ${seed.frameId}`] : []),
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
    `\`ft ideas run --seed ${seed.id} --repo /path/to/repo${seed.frameId ? '' : ' --frame <frame-id>'}\``,
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
    ...(run.model ? [`model: "${escapeYaml(run.model)}"`] : []),
    ...(run.engine ? [`engine: "${escapeYaml(run.engine)}"`] : []),
    ...(run.engineModel ? [`engine_model: "${escapeYaml(run.engineModel)}"`] : []),
    ...(run.engineEffort ? [`engine_effort: "${escapeYaml(run.engineEffort)}"`] : []),
    ...(run.nodeTarget ? [`node_target: ${run.nodeTarget}`] : []),
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
    ...(run.model ? [`- Model: ${run.model}`] : []),
    ...(run.nodeTarget ? [`- Nodes requested: ${run.nodeTarget}`] : []),
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
    `\`ft ideas run --seed <seed-id> --repo "${run.repo}" --frame ${run.frame.id} --depth ${run.depth}${renderRunProfileFlags(run)}${run.nodeTarget ? ` --nodes ${run.nodeTarget}` : ''}${run.steering ? ` --steering "${escapeYaml(run.steering)}"` : ''}\``,
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
    ...(dot.essay ? ['**Essay**', '', dot.essay, ''] : []),
    '**Why adjacent**',
    '',
    dot.rationale,
    '',
    '**Implementation prompt**',
    '',
    dot.implementationPrompt ?? dot.exportablePrompt.trim(),
    '',
    '**Portable prompt**',
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
    '## Goal',
    '',
    `Improve ${dot.repoSurface} by delivering "${dot.title}".`,
    '',
    'The work is done when the repo behavior reflects this idea, the important edge cases are covered, and the verification steps give a future maintainer confidence that the change really works.',
    '',
    ...(dot.essay ? ['## Essay', '', dot.essay, ''] : []),
    '## Context',
    '',
    `- Run: ${run.id}`,
    `- Repo surface: ${dot.repoSurface}`,
    `- Effort: ${dot.effortEstimate}`,
    `- Axis A: ${dot.axisAScore} — ${dot.axisAJustification}`,
    `- Axis B: ${dot.axisBScore} — ${dot.axisBJustification}`,
    '',
    '## Why it surfaced',
    '',
    dot.rationale,
    '',
    '## Prompt',
    '',
    dot.implementationPrompt ?? dot.exportablePrompt.trim(),
    '',
    '## Portable prompt',
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

export function ideasBatchMdPath(batch: IdeasBatchSummary): string {
  return path.join(ideasBatchesDir(dayStamp(batch.createdAt)), `${batch.id}.md`);
}

export function renderIdeasBatchMd(batch: IdeasBatchSummary): string {
  // Derive the parallel YAML arrays from the single source of truth so they
  // cannot drift out of lockstep.
  const repos = batch.repoRuns.map((r) => r.repo);
  const considerationIds = batch.repoRuns.map((r) => r.runId);

  return [
    '---',
    'type: ideas-batch-summary',
    `id: ${batch.id}`,
    `created_at: ${batch.createdAt}`,
    ...(batch.seedId ? [`seed_id: ${batch.seedId}`] : []),
    `seed_artifact_ids: [${batch.seedArtifactIds.map((id) => `"${escapeYaml(id)}"`).join(', ')}]`,
    `frame_id: ${batch.frameId}`,
    `frame_name: "${escapeYaml(batch.frameName)}"`,
    `depth: ${batch.depth}`,
    `model: "${escapeYaml(batch.model)}"`,
    ...(batch.engine ? [`engine: "${escapeYaml(batch.engine)}"`] : []),
    ...(batch.engineModel ? [`engine_model: "${escapeYaml(batch.engineModel)}"`] : []),
    ...(batch.engineEffort ? [`engine_effort: "${escapeYaml(batch.engineEffort)}"`] : []),
    ...(batch.nodeTarget ? [`node_target: ${batch.nodeTarget}`] : []),
    ...(batch.steering ? [`steering: "${escapeYaml(batch.steering)}"`] : []),
    `consideration_ids: [${considerationIds.map((id) => `"${escapeYaml(id)}"`).join(', ')}]`,
    `repos: [${repos.map((r) => `"${escapeYaml(r)}"`).join(', ')}]`,
    `total_dot_count: ${batch.totalDotCount}`,
    '---',
    '',
    `# Ideas batch ${batch.id}`,
    '',
    '## Summary',
    '',
    ...(batch.seedId ? [`- Seed: ${batch.seedId}`] : []),
    `- Frame: ${batch.frameName} (${batch.frameId})`,
    `- Depth: ${batch.depth}`,
    `- Model: ${batch.model}`,
    ...(batch.nodeTarget ? [`- Nodes requested per repo: ${batch.nodeTarget}`] : []),
    `- Repos: ${batch.repoRuns.length}`,
    `- Considerations: ${batch.repoRuns.length}`,
    `- Total scored ideas: ${batch.totalDotCount}`,
    `- Created: ${batch.createdAt}`,
    '',
    '## Per-repo runs',
    '',
    ...batch.repoRuns.map(({ repo, runId }) => `- ${repo} → ${runId}`),
    '',
    ...(batch.topDots.length > 0 ? renderTopDotsSection(batch) : []),
    '## Re-run',
    '',
    'Re-run this batch shape later with:',
    '',
    `\`ft ideas run --seed <seed-id> --repos ${repos.map((r) => `"${escapeYaml(r)}"`).join(' ')} --frame ${batch.frameId} --depth ${batch.depth}${renderRunProfileFlags(batch)}${batch.nodeTarget ? ` --nodes ${batch.nodeTarget}` : ''}${batch.steering ? ` --steering "${escapeYaml(batch.steering)}"` : ''}\``,
    '',
  ].join('\n');
}

function renderTopDotsSection(batch: IdeasBatchSummary): string[] {
  const lines: string[] = ['## Top ideas across all repos', ''];
  for (const entry of batch.topDots) {
    lines.push(`### ${entry.dot.title}`);
    lines.push('');
    lines.push(`- Repo: ${entry.repo}`);
    lines.push(`- Run: ${entry.runId}`);
    lines.push(`- Dot id: ${entry.dotArtifactId}`);
    lines.push(`- Axis A: ${entry.dot.axisAScore}/100`);
    lines.push(`- Axis B: ${entry.dot.axisBScore}/100`);
    lines.push('');
    lines.push(entry.dot.summary);
    lines.push('');
  }
  return lines;
}

export async function writeIdeasBatchMd(batch: IdeasBatchSummary): Promise<string> {
  const filePath = ideasBatchMdPath(batch);
  await writeMd(filePath, renderIdeasBatchMd(batch));
  return filePath;
}
