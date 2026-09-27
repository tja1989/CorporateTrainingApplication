export type EscalationPayload = {
  name: string;
  subject: string;
  body: string;
  version: string;
};

export class EscalationPreviewChangedError extends Error {
  constructor() {
    super("The conversation changed. Review the updated conversation before sharing.");
  }
}
