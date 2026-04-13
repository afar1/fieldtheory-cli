import { writeIdeasIndex } from './ideas-index.js';
import { writeIdeasLatestPointers } from './ideas-latest.js';

export async function refreshIdeasDerivedState(): Promise<void> {
  await writeIdeasIndex();
  await writeIdeasLatestPointers();
}
