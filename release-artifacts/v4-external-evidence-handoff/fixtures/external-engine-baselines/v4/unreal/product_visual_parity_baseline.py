"""
Compatibility wrapper for the Galileo3D V4 Unreal product visual baseline.
The maintained implementation is v4_external_visual_baseline_runner.py; this
entry point delegates to it so the legacy product runner cannot drift into a
blank or weaker capture path.
"""
import os
import runpy
import sys
import unreal

SCENE_PATH = "fixtures/external-engine-baselines/v4/product-visual-parity-scene.json"
SCREENSHOT_PATH = "tests/reports/v4-product-visual-parity/unreal-product-baseline.png"
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__)) if "__file__" in globals() else "fixtures/external-engine-baselines/v4/unreal"
GENERIC_RUNNER = os.path.join(CURRENT_DIR, "v4_external_visual_baseline_runner.py")

if not os.path.exists(GENERIC_RUNNER):
    raise RuntimeError("Missing maintained Unreal baseline runner: " + GENERIC_RUNNER)

unreal.log("Delegating Galileo3D V4 product visual baseline to " + GENERIC_RUNNER)
sys.argv = [GENERIC_RUNNER, SCENE_PATH, SCREENSHOT_PATH]
runpy.run_path(GENERIC_RUNNER, run_name="__main__")
