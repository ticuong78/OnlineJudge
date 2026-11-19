/** Questions on a class board that no teacher has answered yet (the class page's Bảng tin badge, OJ-32). */
export function awaitingQuestions(threads: readonly { awaitingAnswer: boolean }[] | null | undefined): number {
  return (threads ?? []).filter((t) => t.awaitingAnswer).length;
}
