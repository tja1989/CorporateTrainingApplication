export type FeedbackKind = "course" | "instructor";
export type FeedbackInput = {
  completionId: string;
  kind: FeedbackKind;
  rating: number;
  comment: string;
  expectedRevision: number;
  requestId: string;
};
export type DeliverySnapshot = {
  id: string;
  enrollmentId: string;
  courseId: string;
  departmentId: string | null;
  instructorId: string | null;
  completedRecordId: string | null;
};
export type SavedFeedback = {
  id: string;
  rating: number;
  comment: string;
  revision: number;
  updatedAt: Date;
  commentHidden: boolean;
  excluded: boolean;
};
