"""Validate controller-recorded public video evidence before assigning local passes."""
import json
from pathlib import Path

REQUIRED_VIDEO_CASES = {'VIDEO:playback', 'VIDEO:seek', 'VIDEO:threshold'}

def validate_manual_video(path, source_commit, build_id):
    path = Path(path)
    try:
        manifest = json.loads(path.read_text())
    except (OSError, json.JSONDecodeError) as error:
        raise ValueError(f'Cannot read manual video manifest: {path}') from error
    def require(condition, message):
        if not condition: raise ValueError(message)
    require(isinstance(manifest, dict) and manifest.get('status') == 'PASSED', 'Manual video did not pass')
    require(manifest.get('sourceCommit') == source_commit and manifest.get('buildId') == build_id,
            'Manual video source/build does not match the clean qualification runtime')
    browser, viewport = manifest.get('browser', {}), manifest.get('viewport', {})
    require(isinstance(browser, dict) and all(isinstance(browser.get(key), str) and browser[key].strip() for key in ['name', 'version']),
            'Manual browser name and version are required')
    require(isinstance(viewport, dict) and all(isinstance(viewport.get(key), (int, float)) and viewport[key] > 0 for key in ['width', 'height']),
            'Manual viewport dimensions are required')
    checks = manifest.get('checks', [])
    require(isinstance(checks, list) and all(isinstance(check, dict) for check in checks), 'Invalid manual checks')
    require(len(checks) == 3 and {check.get('id') for check in checks} == REQUIRED_VIDEO_CASES,
            'Complete playback, seek-only and threshold scope is required exactly once')
    evidence_by_case = {}
    for check in checks:
        require(check.get('status') == 'PASSED', f"Manual case did not pass: {check.get('id')}")
        require(isinstance(check.get('steps'), list) and check['steps'] and all(isinstance(step, str) and step.strip() for step in check['steps']),
                'Manual steps are required')
        require(isinstance(check.get('actual'), str) and check['actual'].strip(), 'Manual actual result is required')
        evidence = check.get('evidence', {})
        require(isinstance(evidence, dict), 'Manual artifacts are required')
        files = [str(path)]
        for kind in ['dom', 'screenshots', 'persistence']:
            references = evidence.get(kind)
            require(isinstance(references, list) and references, f'Missing manual {kind} artifacts')
            for reference in references:
                require(isinstance(reference, str) and reference.strip(), 'Invalid manual artifact path')
                artifact = path.parent / reference
                require(not Path(reference).is_absolute() and artifact.resolve().is_relative_to(path.parent.resolve()),
                        'Manual artifacts must stay within their evidence package')
                require(artifact.is_file() and artifact.stat().st_size > 0, f'Missing/empty manual artifact: {artifact}')
                files.append(str(artifact))
        evidence_by_case[check['id']] = sorted(set(files))
    return evidence_by_case
