export type OverwriteAttempt = {
  chapterId: string;
  title: string;
  content: string;
  expectedRevision: number;
  saveId: string;
  draftSeq: number;
};

export async function prepareOverwriteAttempt(
  previous: OverwriteAttempt | null,
  draft: Pick<OverwriteAttempt, "chapterId" | "title" | "content" | "draftSeq">,
  getRevision: () => Promise<number>,
  createSaveId: () => string,
): Promise<OverwriteAttempt> {
  if (previous?.chapterId === draft.chapterId &&
      previous.draftSeq === draft.draftSeq &&
      previous.title === draft.title &&
      previous.content === draft.content) {
    return previous;
  }
  return {
    ...draft,
    expectedRevision: await getRevision(),
    saveId: createSaveId(),
  };
}
