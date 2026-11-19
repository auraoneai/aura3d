# Edit the Prism Observatory instrument

The model is in metres, with +Y up and +Z forward. The builder defines the pedestal bearings, meridian fork, three gimbal rings, calibration marks and cut prism. Each ring and the prism have their own named mesh and pivot at `[0, 1.4, 0]`. Adjust ring angles, radii, engraving intervals, facet coordinates and PBR materials in [build_instrument.py](build_instrument.py).

[pedestal.glb](pedestal.glb) is the editable 9,699-triangle enamel section of the original fal.ai reconstruction, including its colour, normal and metallic-roughness maps. Open it in a glTF editor to change its shape or surface. The builder fits it between the base flanges. The committed input contains all geometry and textures required to rebuild the model offline. [Asset provenance and generator terms](../../marketing/public/models/prism-observatory/provenance.json)

From the repository root, run the following commands in a Python environment.

```sh
python3 -m pip install -r tools/prism-observatory/requirements.txt
python3 tools/prism-observatory/build_instrument.py --output /tmp/prism-observatory.glb
cmp /tmp/prism-observatory.glb marketing/public/models/prism-observatory/instrument.glb
```

The shipping GLB has SHA-256 `51eeee0e63ef499e6719b0231c067500032649b2b93250c773f5fc7b4b037f0d`. After an intentional model edit, review the new GLB in the interactive example and update its public provenance when replacing the shipping asset.
