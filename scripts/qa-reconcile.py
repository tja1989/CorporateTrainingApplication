"""Reconcile requirements and source surfaces against two actual complete runs.
Run only after the same-source no-retry browser matrix and isolated service runs.
This script never infers a pass from a source file or a test title alone.
"""
import argparse, json
from pathlib import Path
from qa_manual_evidence import validate_manual_video

parser = argparse.ArgumentParser()
parser.add_argument('--runs', nargs=2, required=True)
parser.add_argument('--services', nargs=2, required=True)
parser.add_argument('--performance', required=True)
parser.add_argument('--manual-video', required=True)
parser.add_argument('--planned-matrix', default='.artifacts/task-5-planned-matrix.json')
parser.add_argument('--source-inventory', default='.artifacts/task-5-source-inventory.json')
args = parser.parse_args()

def read(path): return json.loads(Path(path).read_text())
def executions(report):
    found = []
    def walk(suite):
        for spec in suite.get('specs', []):
            for test in spec['tests']:
                found.append({'title':spec['title'],'file':spec['file'],'line':spec['line'], 'project':test['projectName'],
                    'status':test['status'], 'attempts':len(test.get('results', [])),
                    'outcomes':[result['status'] for result in test.get('results', [])]})
        for child in suite.get('suites', []): walk(child)
    for suite in report['suites']: walk(suite)
    return found

runs=[]
for folder in args.runs:
    report=read(f'{folder}/results.json'); env=read(f'{folder}/environment.json'); tests=executions(report)
    assert not report.get('errors'), report.get('errors')
    assert tests and all(t['status']=='expected' and t['attempts']==1 and t['outcomes']==['passed'] for t in tests), f'{folder}: not a complete no-retry pass'
    assert not env['dirty'], f'{folder}: checkout changed before qualification'
    assert not env['runtimeBuildDirty'] and env['runtimeBuildCommit'], f'{folder}: missing clean runtime provenance'
    runs.append({'folder':folder,'env':env,'tests':tests})
assert {(r['env']['runtimeBuildCommit'],r['env']['runtimeBuildId']) for r in runs}.__len__()==1,'Runtime changed between complete runs'
assert len({r['env']['commit'] for r in runs})==1, 'Checkout changed between complete runs'
planned=executions(read(args.planned_matrix))
expected={(t['file'],t['title'],t['project']) for t in planned}
assert all({(t['file'],t['title'],t['project']) for t in run['tests']}==expected for run in runs),'Executed matrix omits planned tests/projects'
services=[read(f'{folder}/results.json') for folder in args.services]
assert all(s['evidence'][-1]['step']=='PASSED' for s in services),'Service qualification incomplete'
required_service_steps = {
    'overlapping rules serialize assignments and preserve alternate coverage',
    'rule evaluation participates in caller rollback and recovers once',
    'due-soon sweep and notification dedupe', 'overdue transition followed by actual UI completion',
    'expiry and UI renewal preserve history', 'real queue handler failure and retry',
    'saturated pool completes once with atomic awards and notification', 'forced rollback persistence',
    'rollback recovery produces one real completion notification and one post-commit console email',
    'interleaved real heartbeat and renewal', 'one-bucket pre-renewal receipt cannot credit new cycle',
    'fresh one-bucket playback completes renewed cycle normally',
}
assert all(required_service_steps <= {entry['step'] for entry in s['evidence']} for s in services), 'A focused service subset cannot qualify the complete service gate'
assert all(s['sourceBuildCommit']==runs[0]['env']['runtimeBuildCommit'] and s['buildId']==runs[0]['env']['runtimeBuildId'] and s['buildDirty']=='0' for s in services),'Service runtime does not match'
performance=read(args.performance)
assert {row['family'] for row in performance.get('summary', [])}=={'home','catalog','course','lesson','manager','admin'},'All six performance families required'
assert all(row['passed'] for row in performance['summary']),'Performance budgets not met'
assert performance['metadata']['buildCommit']==runs[0]['env']['runtimeBuildCommit'] and performance['metadata']['runtimeBuildId']==runs[0]['env']['runtimeBuildId'] and not performance['metadata']['buildDirty'],'Performance runtime does not match'
assert len(performance['runs'])==18 and all(sum(row['family']==family for row in performance['runs'])==3 for family in {'home','catalog','course','lesson','manager','admin'}),'Three performance samples per family required'
manual_video=validate_manual_video(args.manual_video, runs[0]['env']['runtimeBuildCommit'], runs[0]['env']['runtimeBuildId'])

mapping=read('docs/qa/case-evidence-map.json'); cases=[]
roles={'AUTH':['all roles'],'NAV':['all roles'],'DISCOVER':['LEARNER'],'PATH':['LEARNER','MANAGER','ADMIN'],'CONTENT':['LEARNER'],'VIDEO':['LEARNER'],'TUTOR':['LEARNER'],'QUIZ':['LEARNER'],'QUIZ-RULES':['LEARNER'],'REVIEW':['LEARNER','ADMIN'],'VOICE':['LEARNER','ADMIN'],'HR':['LEARNER','MANAGER'],'TICKET':['LEARNER','ADMIN'],'PRACTICE':['LEARNER'],'MANAGER':['MANAGER','LEARNER'],'PEOPLE':['ADMIN'],'AUTHOR':['ADMIN','LEARNER'],'POLICY':['ADMIN','LEARNER'],'INTEGRITY':['LEARNER','ADMIN'],'REPORTS':['MANAGER','ADMIN'],'COMPLIANCE':['LEARNER','MANAGER','ADMIN'],'ACCOUNT/SYSTEM':['all roles']}
for record in mapping['cases']:
    selected=[]
    for pattern in record['browserTests']:
        matches=[t for t in runs[0]['tests'] if pattern in t['title']]
        assert matches,(record['id'],pattern)
        selected+=matches
    selected=list({(t['title'],t['project']):t for t in selected}.values())
    tests=sorted({t['title'] for t in selected}); projects=sorted({t['project'] for t in selected})
    evidence=[f"{r['folder']}/results.json" for r in runs] if selected else []
    if record.get('service'):evidence += [f'{folder}/results.json' for folder in args.services]
    if record.get('manual'):evidence += manual_video[record['id']]
    if record.get('performance'):evidence += [args.performance]
    status='UNVERIFIED' if record.get('unverified') else 'PASSED'
    local_status='PASSED' if selected or record.get('service') or record.get('manual') or record.get('performance') else 'NOT_APPLICABLE'
    cases.append({**record,'role':roles[record['id'].split(':')[0]],'status':status,'localStatus':local_status,
        'setup':'Unique local prerequisites from named tests; no production/staging data. UI performs user operations; API-only and background operations are separately identified.',
        'steps':tests,'actual':record.get('unverified') or 'Passed both complete no-retry production-build runs and the associated service/manual/performance evidence where listed.',
        'evidence':evidence,'commit':runs[0]['env']['runtimeBuildCommit'],'runtimeBuildId':runs[0]['env']['runtimeBuildId'],
        'browserViewport':projects,'executedBrowserCasesPerRun':len(selected)})
Path('docs/qa/workflow-cases.json').write_text(json.dumps(cases,indent=2)+'\n')

# Source entry points identify where the qualified cases execute; the browser
# assertions above, never AST enumeration, supply their local pass evidence.
route_cases={
'/activate':['AUTH:activation','AUTH:initial-values'],'/login':['AUTH:invalid','AUTH:destinations','AUTH:initial-values'],'/login/mfa':['AUTH:mfa','AUTH:initial-values'],'/login/mfa-setup':['AUTH:mfa','AUTH:initial-values'],
'/privacy-notice':['AUTH:privacy'],'/':['AUTH:destinations'],'/home':['CONTENT:text','COMPLIANCE:due'],'/learn':['DISCOVER:search','DISCOVER:filters','DISCOVER:views'],
'/course/[courseId]':['CONTENT:text','AUTHOR:order','COMPLIANCE:certificate'],'/path/[pathId]':['PATH:order','PATH:unlock'],'/lesson/[lessonId]':['CONTENT:text','CONTENT:pdf','CONTENT:readiness','VIDEO:threshold','TUTOR:grounded'],'/lesson/[lessonId]/interview':['VOICE:assessment'],'/quiz/[quizId]':['QUIZ:types','QUIZ:submit','REVIEW:appeal'],
'/drill':['PRACTICE:locked','PRACTICE:session'],'/ask-hr':['HR:citation','HR:escalation','HR:privacy','HR:readiness'],'/ask-hr/live':['VOICE:consent','VOICE:fallback','VOICE:cleanup','HR:privacy'],'/ask-hr/tickets/[ticketId]':['TICKET:thread','TICKET:isolation','TICKET:readiness','HR:privacy','HR:unlock-readiness'],'/policy/[docId]':['HR:citation','POLICY:version'],'/inbox':['ACCOUNT/SYSTEM:inbox'],'/profile':['ACCOUNT/SYSTEM:profile'],
'/admin':['NAV:workspace','ACCOUNT/SYSTEM:responsive'],'/admin/courses':['AUTHOR:draft'],'/admin/courses/[courseId]':['AUTHOR:types','AUTHOR:order','AUTHOR:publish','AUTHOR:ingest'],'/admin/people':['PEOPLE:import','PEOPLE:edit','PEOPLE:rules','AUTH:reset'],'/admin/reviews':['REVIEW:decision','REVIEW:appeal','VOICE:assessment'],'/admin/corpus':['POLICY:version','POLICY:failure'],'/admin/tickets':['TICKET:thread'],'/admin/tickets/[ticketId]':['TICKET:thread'],'/admin/integrity':['INTEGRITY:events'],'/admin/integrity/[attemptId]':['INTEGRITY:decision'],'/admin/reports':['REPORTS:six','REPORTS:pagination','REPORTS:ask','REPORTS:reset','REPORTS:readiness'],'/admin/inbox':['ACCOUNT/SYSTEM:inbox'],
'/team':['MANAGER:team'],'/team/[userId]':['MANAGER:assign','MANAGER:nudge','AUTH:reset'],'/team/[userId]/reset-code':['ACCOUNT/SYSTEM:accessibility','AUTH:reset'],'/team/reports':['REPORTS:six','REPORTS:pagination','REPORTS:ask','MANAGER:isolation','REPORTS:readiness'],'/team/inbox':['ACCOUNT/SYSTEM:inbox']}
api_cases={
'/api/admin/dsr/[userId]':['ACCOUNT/SYSTEM:dsr'],'/api/attempt/[attemptId]/appeal':['REVIEW:appeal'],'/api/attempt/appeal-latest':['REVIEW:appeal'],'/api/attempt/[attemptId]':['QUIZ:navigation','QUIZ:offline','QUIZ:submit'],'/api/certificates/[certId]':['COMPLIANCE:certificate','AUTH:mfa'],'/api/drill':['PRACTICE:session'],'/api/events':['VIDEO:seek','HR:citation'],'/api/health':['ACCOUNT/SYSTEM:states'],'/api/hr':['HR:citation','HR:sensitive','HR:privacy','HR:readiness'],'/api/hr/reauth':['HR:unlock-readiness','HR:privacy','AUTH:mfa','AUTH:privacy'],'/api/hr/escalate':['HR:escalation','HR:privacy'],'/api/hr/feedback':['HR:citation','HR:privacy'],'/api/live/hr/session':['VOICE:consent','VOICE:fallback','HR:privacy'],'/api/live/hr/event':['VOICE:fallback','VOICE:cleanup','HR:escalation','HR:privacy'],'/api/live/interview/session':['VOICE:assessment'],'/api/live/interview/event':['VOICE:assessment','COMPLIANCE:recert'],'/api/progress':['VIDEO:threshold','CONTENT:locked'],'/api/quiz/[quizId]/consent-info':['INTEGRITY:consent'],'/api/quiz/[quizId]/start':['QUIZ-RULES:attempts'],'/api/reports/[reportId]/csv':['REPORTS:six'],'/api/reports/ask':['REPORTS:ask','REPORTS:readiness'],'/api/tutor':['TUTOR:grounded','TUTOR:unavailable'],'/api/tutor/suggest':['TUTOR:grounded']}
action_cases={
'loginAction':['AUTH:invalid'],'activateAction':['AUTH:activation'],'mfaVerifyAction':['AUTH:mfa'],'mfaSetupBegin':['AUTH:mfa'],'mfaSetupConfirm':['AUTH:mfa'],'replyToTicketAction':['TICKET:thread','TICKET:readiness'],'completeLessonAction':['CONTENT:text','CONTENT:pdf','CONTENT:readiness'],'markCompleteAction':['CONTENT:text','CONTENT:pdf'],'publishPolicyAction':['POLICY:version','POLICY:failure'],'createCourseAction':['AUTHOR:draft'],'updateCourseAction':['AUTHOR:draft'],'setCourseStatusAction':['AUTHOR:publish'],'addModuleAction':['AUTHOR:draft'],'addLessonAction':['AUTHOR:types'],'updateInterviewLessonAction':['AUTHOR:types'],'retryIngestAction':['AUTHOR:ingest'],'moveLessonAction':['AUTHOR:order'],'moveModuleAction':['AUTHOR:order'],'clearAttemptAction':['INTEGRITY:decision'],'voidAttemptAction':['INTEGRITY:decision'],'updateUserAction':['PEOPLE:edit','PEOPLE:rules'],'issueCodeAction':['AUTH:reset'],'importCsvAction':['PEOPLE:import'],'createRuleAction':['PEOPLE:rules'],'toggleRuleAction':['PEOPLE:rules'],'createGroupAction':['PEOPLE:edit'],'confirmGradeAction':['REVIEW:decision'],'adjustGradeAction':['REVIEW:appeal'],'approveDraftAction':['AUTHOR:types'],'discardDraftAction':['AUTHOR:types'],'markInterviewReviewedAction':['VOICE:assessment'],'overturnInterviewAction':['VOICE:assessment','COMPLIANCE:recert'],'adminReplyAction':['TICKET:thread'],'resolveTicketAction':['TICKET:thread'],'assignAction':['MANAGER:assign'],'nudgeAction':['MANAGER:nudge'],'issueResetAction':['AUTH:reset'],'markAllRead':['ACCOUNT/SYSTEM:inbox'],'login':['AUTH:invalid'],'activate':['AUTH:activation'],'verifyMfa':['AUTH:mfa'],'acknowledgePrivacyNotice':['AUTH:privacy'],'logout':['AUTH:logout'],'issueResetCode':['AUTH:reset'],'switchWorkspace':['NAV:workspace']}
by_id={c['id']:c for c in cases};source=read(args.source_inventory)
def surface(entry,ids):
    assert ids and all(by_id[id]['localStatus']=='PASSED' for id in ids)
    return {**entry,'cases':ids,'status':'PASSED_LOCAL','evidence':sorted({p for id in ids for p in by_id[id]['evidence']}),'runtimeCommit':runs[0]['env']['runtimeBuildCommit'],'runtimeBuildId':runs[0]['env']['runtimeBuildId']}
inventory={'source':source,'qualification':'Local UI and API/service evidence reconciled; real AI/voice and physical iPhone remain explicitly UNVERIFIED in workflow-cases.json',
    'routes':[surface(entry,route_cases[entry['route']]) for entry in source['routes']],
    'apiRoutes':[surface(entry,api_cases[entry['route']]) for entry in source['apis']],
    'serverActions':[surface(entry,action_cases[entry['name']]) for entry in source['serverActions']]}
for action in inventory['serverActions']:
    if action['name']=='markCompleteAction':
        action['status']='NOT_EXPOSED_IN_CURRENT_UI'
        action['note']='Unbound compatibility wrapper delegates authorization/completion to completeLessonAction then redirects. Source reviewed; no distinct visible control or independently invoked wrapper claimed.'
Path('docs/qa/coverage-inventory.json').write_text(json.dumps(inventory,indent=2)+'\n')
print(json.dumps({'cases':len(cases),'passedLocal':sum(c['localStatus']=='PASSED' for c in cases),'unverifiedExternal':sum(c['status']=='UNVERIFIED' for c in cases),'executionsPerRun':len(runs[0]['tests']),'sourceCounts':source['counts']},indent=2))
