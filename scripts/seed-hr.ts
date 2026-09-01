/**
 * HR corpus seed (M4): the FICTIONAL "Demo Retail Co." handbook. Figures are
 * deliberately invented (spec FR-8.3) — never real statutory numbers an
 * employee could rely on. One policy ships as v1-superseded + v2-active to
 * demo the versioning filter.
 */
export async function seedHrCorpus(adminId: string): Promise<void> {
  const { db, t } = await import("../lib/db/client");
  const { id } = await import("../lib/ids");
  const { publishPolicyVersion } = await import("../lib/hr/ingest");
  const { hrAnswer } = await import("../lib/hr/assistant");

  const docs: Array<{ title: string; body: string; audience?: "all" | "managers" }> = [
    {
      title: "Working Hours & Overtime Policy",
      body: `# Working Hours & Overtime

## Standard hours
Demo Retail Co. store colleagues work 8 hours per day, 45 hours per week, scheduled by the store roster. You get at least one full rest day each week, except during the annual stocktake week, when rest days may move to the following week with your agreement.

## Breaks
A paid 30-minute break applies after every 5 continuous working hours. Fresh-food colleagues get one extra 10-minute hygiene break per shift.

## Seasonal reduced hours
During designated seasonal periods announced by HR, daily hours reduce by 2 hours with no pay change, unless you are on a temporary contract of less than 3 months.

## Overtime
Overtime must be approved by your team leader in advance. Approved overtime is paid at 130% of your basic hourly rate, and 145% for hours between 22:00 and 05:00. Overtime is capped at 2 hours per day, except during announced peak trading weeks when the cap is 3 hours.`,
    },
    {
      title: "Leave & Time Off Policy",
      body: `# Leave & Time Off

## Annual leave
Colleagues earn 28 working days of annual leave per year after 12 months of service. In your first year you accrue 2 days per completed month, starting from month 7. Leave must be requested through your team leader at least 14 days ahead, except emergency leave, which HR can approve same-day.

## Sick leave
With a medical certificate, sick leave is paid as follows: the first 12 days at full pay, the next 24 days at half pay, and any further days unpaid, up to 80 days per year. Uncertified absence is treated as unpaid and may be reviewed under the attendance policy.

## Parental leave
New mothers receive 70 calendar days of maternity leave at full pay, and may add 30 unpaid days. This applies regardless of length of service. New fathers receive 7 working days within the first 6 months.

## Public holidays
Published public holidays are paid days off. If the roster requires you to work one, you receive either a substitute day off within 30 days or 150% pay for that day — your choice, unless the store is in a declared emergency period.`,
    },
    {
      title: "Pay & Salary Timing Policy",
      body: `# Pay & Salary

## When you are paid
Salaries are transferred to your registered bank account by the 28th of each month. If the 28th falls on a public holiday, payment moves to the previous working day.

## Payslips
Digital payslips are available in the HR portal within 2 days of payment. Report any discrepancy to HR within 30 days.

## Allowances
Store colleagues receive a monthly transport allowance of 250 dirhams and, where applicable, a uniform allowance of 40 dirhams, except colleagues on fully-remote contracts, who receive neither.

## Deductions
Deductions happen only where the law or a signed agreement allows them, and every deduction is itemized on your payslip. Till variances are never deducted from pay; they are handled under the POS policy.`,
    },
    {
      title: "End-of-Service & Final Pay Policy",
      body: `# End-of-Service & Final Pay

## Service award
When you leave Demo Retail Co. after at least one full year of service, you receive a service award calculated on your basic salary: 15 days' pay for each of the first 4 years of service, and 25 days' pay for each year after that, capped at a total of 20 months' pay.

## Resignation vs termination
The service award is paid in full whether you resign or your contract is ended by the company, except in cases of proven gross misconduct confirmed by the disciplinary committee.

## Final settlement timing
Your final settlement — last salary, unused annual leave (paid out at basic rate), and the service award — is transferred within 14 days of your last working day.

## Unused leave
Up to 30 unused annual-leave days are paid out at basic salary rate. Days beyond 30 lapse, unless HR approved a carry-over in writing.`,
    },
    {
      title: "Manager Guide: Disciplinary Process",
      audience: "managers",
      body: `# Disciplinary Process (Managers)

## Principles
Managers must document concerns early, involve HR before any formal step, and never make promises about outcomes. All formal warnings are issued by HR, not by line managers.

## Steps
1. Informal conversation, documented in the team log.
2. HR-led review meeting with the colleague.
3. Written warning (valid 6 months) or final warning (valid 12 months).
4. Disciplinary committee for repeated or serious cases.`,
    },
  ];

  // v1 of Leave policy (superseded — proves the versioning filter)
  await publishPolicyVersion({
    title: "Leave & Time Off Policy",
    country: "AE",
    audience: "all",
    language: "en",
    owner: "Head of HR Operations",
    effectiveDate: new Date(Date.now() - 400 * 24 * 3600_000),
    body: `# Leave & Time Off\n\n## Annual leave\nColleagues earn 24 working days of annual leave per year. (Superseded version — the current policy grants 28.)\n\n## Sick leave\nThe first 10 days at full pay, the next 20 at half pay.`,
    isDemo: true,
  });

  for (const doc of docs) {
    await publishPolicyVersion({
      title: doc.title,
      country: "AE",
      audience: doc.audience ?? "all",
      language: "en",
      owner: "Head of HR Operations",
      effectiveDate: new Date(Date.now() - 30 * 24 * 3600_000),
      body: doc.body,
      isDemo: true,
    });
  }

  // ---- staged interactions for the KPI dashboard + an escalated ticket
  const learners = await db.select().from(t.users);
  const farhan = learners.find((u) => u.employeeId === "AE10023");
  if (farhan) {
    const drain = async (gen: AsyncGenerator<unknown>) => {
      for await (const _ of gen) void _;
    };
    await drain(hrAnswer({ userId: farhan.id, question: "How many days of annual leave do I get?", country: "AE", audience: "all" }));
    await drain(hrAnswer({ userId: farhan.id, question: "When is salary paid?", country: "AE", audience: "all" }));
    await drain(hrAnswer({ userId: farhan.id, question: "Can I bring my pet falcon to the staff room?", country: "AE", audience: "all" }));

    const convId = id();
    await db.insert(t.hrConversations).values({ id: convId, userId: farhan.id, language: "en" });
    await db.insert(t.hrMessages).values({
      id: id(),
      conversationId: convId,
      role: "user",
      content: "My overtime from last month is missing from my payslip.",
    });
    const ticketId = id();
    await db.insert(t.hrTickets).values({
      id: ticketId,
      conversationId: convId,
      userId: farhan.id,
      subject: "Overtime missing from payslip",
      state: "IN_PROGRESS",
      assigneeId: adminId,
    });
    await db.insert(t.hrTicketMessages).values([
      {
        id: id(),
        ticketId,
        authorId: farhan.id,
        body: "Escalated from the HR assistant. My approved overtime from the 12th and 13th is not on this month's payslip.",
      },
      {
        id: id(),
        ticketId,
        authorId: adminId,
        body: "Thanks Farhan — checking with payroll. Per the Pay & Salary policy, discrepancies reported within 30 days are corrected in the next cycle. I'll confirm by Thursday.",
      },
    ]);
  }

  console.log("HR corpus seeded: 6 policy versions (1 superseded), staged conversations + ticket.");
}
