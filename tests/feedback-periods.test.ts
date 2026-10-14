import {expect,it} from "vitest";
import {feedbackPeriod} from "../lib/feedback/periods";
it("uses local Monday boundaries even before UTC reaches Monday",()=>{
 const week=feedbackPeriod("week",new Date("2026-10-11T21:00:00Z"),"Asia/Dubai");expect(week.start.toISOString()).toBe("2026-10-11T20:00:00.000Z");expect(week.end.toISOString()).toBe("2026-10-18T20:00:00.000Z");
});
it("uses calendar months and handles a daylight-saving week",()=>{
 const month=feedbackPeriod("month",new Date("2026-09-30T21:00:00Z"),"Asia/Dubai");expect(month.start.toISOString()).toBe("2026-09-30T20:00:00.000Z");expect(month.end.toISOString()).toBe("2026-10-31T20:00:00.000Z");
 const dst=feedbackPeriod("week",new Date("2026-03-08T12:00:00Z"),"America/New_York");expect(dst.start.toISOString()).toBe("2026-03-02T05:00:00.000Z");expect(dst.end.toISOString()).toBe("2026-03-09T04:00:00.000Z");
});
it("custom dates include the through-date and reject invalid, reversed or oversized ranges",()=>{
 const custom=feedbackPeriod("custom",new Date(),"Asia/Dubai",{start:"2026-10-01",end:"2026-10-02"});expect(custom.end.toISOString()).toBe("2026-10-02T20:00:00.000Z");
 for(const range of [{start:"2026-02-30",end:"2026-03-01"},{start:"2026-10-03",end:"2026-10-01"},{start:"2024-01-01",end:"2026-01-01"}])expect(()=>feedbackPeriod("custom",new Date(),"Asia/Dubai",range)).toThrow();
});
