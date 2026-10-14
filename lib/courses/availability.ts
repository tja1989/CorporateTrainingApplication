/** Both migrated publications and current approved revisions can be assigned. */
export function isCourseAvailable(course: {status:string;approvalState:string;approvedRevision:number|null;contentRevision:number}): boolean {
 return course.status === "PUBLISHED" && (course.approvalState === "LEGACY_PUBLISHED" || (course.approvalState === "APPROVED" && course.approvedRevision === course.contentRevision));
}
