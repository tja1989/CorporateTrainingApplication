"""The manual-evidence boundary rejects unsupported qualification claims."""
import copy
import json
from pathlib import Path
import sys
import tempfile
import unittest
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from qa_manual_evidence import validate_manual_video

class ManualVideoEvidenceTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        (self.root / 'page.txt').write_text('Real browser step and visible result')
        (self.root / 'screen.png').write_bytes(b'\x89PNG\r\n\x1a\nfixture')
        (self.root / 'database.json').write_text('{"status":"COMPLETED"}')
        self.manifest = {
            'status':'PASSED', 'sourceCommit':'a'*40, 'buildId':'build-current',
            'browser':{'name':'Chrome','version':'153'},
            'viewport':{'width':390,'height':844},
            'checks':[{'id':case, 'status':'PASSED', 'steps':['Perform real player action'],
                'actual':'Observed and persisted the expected result',
                'evidence':{'dom':['page.txt'],'screenshots':['screen.png'],'persistence':['database.json']}}
                for case in ['VIDEO:playback','VIDEO:seek','VIDEO:threshold']],
        }
    def tearDown(self): self.temp.cleanup()
    def validate(self):
        path=self.root/'result.json'; path.write_text(json.dumps(self.manifest))
        return validate_manual_video(path,'a'*40,'build-current')
    def test_accepts_complete_exact_build_evidence(self):
        self.assertEqual(set(self.validate()), {'VIDEO:playback','VIDEO:seek','VIDEO:threshold'})
    def test_rejects_failed_overall_and_case_results(self):
        for target in [self.manifest,self.manifest['checks'][0]]:
            target['status']='FAILED'
            with self.assertRaises(ValueError): self.validate()
            target['status']='PASSED'
    def test_rejects_missing_or_duplicate_case_scope(self):
        self.manifest['checks'].pop()
        with self.assertRaises(ValueError): self.validate()
        self.manifest['checks'].append(copy.deepcopy(self.manifest['checks'][0]))
        with self.assertRaises(ValueError): self.validate()
    def test_rejects_stale_commit_and_build(self):
        for field in ['sourceCommit','buildId']:
            original=self.manifest[field]; self.manifest[field]='unrelated'
            with self.assertRaises(ValueError): self.validate()
            self.manifest[field]=original
    def test_rejects_missing_browser_or_viewport(self):
        self.manifest['browser']={}
        with self.assertRaises(ValueError): self.validate()
        self.manifest['browser']={'name':'Chrome','version':'153'}
        self.manifest['viewport']['width']=0
        with self.assertRaises(ValueError): self.validate()
    def test_rejects_missing_artifact_or_evidence_kind(self):
        self.manifest['checks'][0]['evidence']['dom']=['missing.txt']
        with self.assertRaises(ValueError): self.validate()
        self.manifest['checks'][0]['evidence']['dom']=['page.txt']
        del self.manifest['checks'][0]['evidence']['persistence']
        with self.assertRaises(ValueError): self.validate()
    def test_rejects_artifacts_outside_manifest_package(self):
        self.manifest['checks'][0]['evidence']['dom']=['../unrelated.txt']
        with self.assertRaises(ValueError): self.validate()
    def test_rejects_missing_actual_result(self):
        self.manifest['checks'][0]['actual']=''
        with self.assertRaises(ValueError): self.validate()

if __name__ == '__main__': unittest.main()
