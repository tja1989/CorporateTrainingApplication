/** Video seed — populated in M2 (ingestion pipeline). */
export async function seedVideos(_opts: { courseIds: { customerService: string; foodSafety: string } }): Promise<void> {
  // M2 fills this in: video rows + bundled SRT transcripts → chunks → embeddings.
}
