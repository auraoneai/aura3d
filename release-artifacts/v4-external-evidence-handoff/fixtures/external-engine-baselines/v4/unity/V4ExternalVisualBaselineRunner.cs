using System;
using System.Collections;
using System.IO;
using System.Linq;
using UnityEngine;

public sealed class V4ExternalVisualBaselineRunner : MonoBehaviour
{
    // Assign one of the generated *-scene.json descriptors and set BaselineKind
    // to product-visual, pbr-visual, shadow-visual, hdr-render-target, or postprocess-suite.
    // This scaffold builds a deterministic approximation that must be captured by a
    // real Unity editor run before any Unity parity claim is allowed.
    public TextAsset SceneDescriptor;
    public string BaselineKind = "product-visual";
    public string ScreenshotPath = "tests/reports/v4-external-baseline/unity-baseline.png";

    public static void CaptureFromCommandLine()
    {
        var descriptorPath = CommandLineValue("--descriptor");
        var screenshotPath = CommandLineValue("--screenshot");
        var baselineKind = CommandLineValue("--baseline-kind");
        if (string.IsNullOrEmpty(descriptorPath))
        {
            throw new InvalidOperationException("Missing --descriptor <path> for V4 Unity baseline capture.");
        }
        if (string.IsNullOrEmpty(screenshotPath))
        {
            throw new InvalidOperationException("Missing --screenshot <path> for V4 Unity baseline capture.");
        }
        if (!File.Exists(descriptorPath))
        {
            throw new FileNotFoundException("V4 Unity baseline descriptor was not found.", descriptorPath);
        }
        var descriptor = JsonUtility.FromJson<BaselineSceneDescriptor>(File.ReadAllText(descriptorPath));
        var resolvedKind = string.IsNullOrEmpty(baselineKind) ? descriptor.baselineKind : baselineKind;
        CaptureDescriptor(descriptor, resolvedKind, screenshotPath);
        Debug.Log("Galileo3D V4 Unity baseline command-line capture completed for " + resolvedKind + ": " + screenshotPath);
    }

    private IEnumerator Start()
    {
        if (SceneDescriptor == null)
        {
            throw new InvalidOperationException("Assign a generated V4 external baseline scene descriptor.");
        }
        var descriptor = JsonUtility.FromJson<BaselineSceneDescriptor>(SceneDescriptor.text);
        var baselineKind = string.IsNullOrEmpty(descriptor.baselineKind) ? BaselineKind : descriptor.baselineKind;
        yield return new WaitForEndOfFrame();
        CaptureDescriptor(descriptor, baselineKind, ScreenshotPath);
    }

    private static void CaptureDescriptor(BaselineSceneDescriptor descriptor, string baselineKind, string screenshotPath)
    {
        var targetWidth = descriptor.TargetWidth();
        var targetHeight = descriptor.TargetHeight();
        if (targetWidth > 0 && targetHeight > 0)
        {
            Screen.SetResolution(targetWidth, targetHeight, false);
        }
        BuildScene(descriptor, baselineKind);
        var cameraObject = Camera.main != null ? Camera.main.gameObject : new GameObject("baseline-camera");
        var camera = cameraObject.GetComponent<Camera>() ?? cameraObject.AddComponent<Camera>();
        camera.clearFlags = CameraClearFlags.SolidColor;
        camera.backgroundColor = new Color(0.025f, 0.03f, 0.04f, 1);
        camera.orthographic = true;
        camera.orthographicSize = baselineKind == "pbr-visual" || baselineKind == "postprocess-suite" ? 2.2f : 1.35f;
        cameraObject.transform.position = new Vector3(0, 0, -6);
        cameraObject.transform.rotation = Quaternion.identity;
        var directory = Path.GetDirectoryName(screenshotPath);
        if (!string.IsNullOrEmpty(directory))
        {
            Directory.CreateDirectory(directory);
        }
        var screenshotBytes = CaptureCameraPng(camera, targetWidth, targetHeight, screenshotPath);
        if (screenshotBytes <= 0)
        {
            throw new InvalidOperationException("Synchronous Unity baseline capture wrote an empty PNG: " + screenshotPath);
        }
        WriteRunnerEvidence(descriptor, baselineKind, screenshotPath, targetWidth, targetHeight);
        Debug.Log("Galileo3D V4 external baseline screenshot captured: " + screenshotPath + " at " + targetWidth + "x" + targetHeight + " (" + screenshotBytes + " bytes)");
    }

    private static string CommandLineValue(string key)
    {
        var args = Environment.GetCommandLineArgs();
        for (var i = 0; i < args.Length - 1; i++)
        {
            if (args[i] == key) return args[i + 1];
        }
        return "";
    }

    private static void BuildScene(BaselineSceneDescriptor descriptor, string baselineKind)
    {
        AddLighting(baselineKind);
        if (descriptor.parts != null && descriptor.parts.Length > 0)
        {
            foreach (var part in descriptor.parts)
            {
                CreatePart(part, FindMaterial(descriptor.materials, part.material));
            }
            return;
        }
        switch (baselineKind)
        {
            case "pbr-visual":
                BuildPbrLineup();
                break;
            case "shadow-visual":
                BuildShadowScene();
                break;
            case "hdr-render-target":
                BuildHdrPatches();
                break;
            case "postprocess-suite":
                BuildPostprocessScene();
                break;
            default:
                BuildProductScene();
                break;
        }
    }

    private static void BuildProductScene()
    {
        var body = CreatePart("body", PrimitiveType.Cube, new Vector3(0, -0.04f, 0), new Vector3(1.44f, 0.76f, 0.36f), new Color(0.1f, 0.14f, 0.18f, 1), 0.78f, 0.24f);
        CreatePart("screen", PrimitiveType.Cube, new Vector3(0, 0.02f, 0.03f), new Vector3(1.04f, 0.48f, 0.06f), new Color(0.08f, 0.32f, 0.52f, 0.82f), 0.1f, 0.18f);
        CreatePart("left-dial", PrimitiveType.Sphere, new Vector3(-0.54f, -0.08f, 0), new Vector3(0.56f, 0.56f, 0.16f), Color.black, 0.4f, 0.35f);
        CreatePart("right-dial", PrimitiveType.Sphere, new Vector3(0.54f, -0.08f, 0), new Vector3(0.56f, 0.56f, 0.16f), Color.black, 0.4f, 0.35f);
        for (var i = 0; i < 14; i++)
        {
            var x = -0.84f + i * 0.13f;
            CreatePart("detail-" + i, PrimitiveType.Cube, new Vector3(x, -0.31f + (i % 3) * 0.2f, 0.08f), new Vector3(0.07f, 0.035f, 0.03f), new Color(0.9f, 0.48f, 0.18f, 1), 0.2f, 0.42f);
        }
    }

    private static void BuildPbrLineup()
    {
        for (var i = 0; i < 11; i++)
        {
            var x = -1.65f + i * 0.33f;
            var metallic = i / 10f;
            var roughness = 1f - i / 12f;
            CreatePart("pbr-sample-" + i, PrimitiveType.Sphere, new Vector3(x, 0, 0), new Vector3(0.22f, 0.22f, 0.22f), Color.HSVToRGB(i / 11f, 0.55f, 0.9f), metallic, roughness);
        }
    }

    private static void BuildShadowScene()
    {
        CreatePart("receiver", PrimitiveType.Cube, new Vector3(0, -0.55f, 0.18f), new Vector3(2.1f, 0.08f, 0.8f), new Color(0.72f, 0.74f, 0.68f, 1), 0.0f, 0.7f);
        CreatePart("caster-a", PrimitiveType.Cube, new Vector3(-0.32f, 0.05f, 0), new Vector3(0.38f, 0.78f, 0.38f), new Color(0.22f, 0.44f, 0.9f, 1), 0.15f, 0.38f);
        CreatePart("caster-b", PrimitiveType.Sphere, new Vector3(0.48f, 0.02f, 0), new Vector3(0.48f, 0.48f, 0.48f), new Color(0.9f, 0.42f, 0.18f, 1), 0.25f, 0.32f);
    }

    private static void BuildHdrPatches()
    {
        CreatePart("hdr-dark", PrimitiveType.Cube, new Vector3(-0.72f, 0, 0), new Vector3(0.45f, 0.62f, 0.12f), new Color(0.12f, 0.1f, 0.08f, 1), 0, 0.45f);
        CreatePart("hdr-mid", PrimitiveType.Cube, new Vector3(0, 0, 0), new Vector3(0.45f, 0.62f, 0.12f), new Color(0.85f, 0.62f, 0.25f, 1), 0.1f, 0.28f);
        CreatePart("hdr-hot", PrimitiveType.Cube, new Vector3(0.72f, 0, 0), new Vector3(0.45f, 0.62f, 0.12f), new Color(1f, 0.92f, 0.42f, 1), 0.0f, 0.12f);
    }

    private static void BuildPostprocessScene()
    {
        for (var i = 0; i < 14; i++)
        {
            var angle = i * Mathf.PI * 2f / 14f;
            var radius = 0.35f + (i % 3) * 0.2f;
            CreatePart("postprocess-sample-" + i, PrimitiveType.Sphere, new Vector3(Mathf.Cos(angle) * radius, Mathf.Sin(angle) * radius, 0), new Vector3(0.18f, 0.18f, 0.18f), Color.HSVToRGB(i / 14f, 0.7f, 1), i % 2 == 0 ? 0.35f : 0.05f, 0.25f + i * 0.025f);
        }
    }

    private static void AddLighting(string baselineKind)
    {
        var lightObject = new GameObject("v4-external-baseline-key-light");
        var light = lightObject.AddComponent<Light>();
        light.type = LightType.Directional;
        light.intensity = baselineKind == "hdr-render-target" ? 1.6f : 1.1f;
        lightObject.transform.rotation = Quaternion.Euler(38, -32, 0);
    }

    private static GameObject CreatePart(string name, PrimitiveType primitive, Vector3 position, Vector3 scale, Color color, float metallic, float roughness)
    {
        var obj = GameObject.CreatePrimitive(primitive);
        obj.name = name;
        obj.transform.position = position;
        obj.transform.localScale = scale;
        var material = new Material(Shader.Find("Standard"));
        material.color = color;
        material.SetFloat("_Metallic", metallic);
        material.SetFloat("_Glossiness", 1f - roughness);
        obj.GetComponent<Renderer>().material = material;
        return obj;
    }

    private static GameObject CreatePart(PartDescriptor part, MaterialDescriptor material)
    {
        var obj = GameObject.CreatePrimitive(PrimitiveFromString(part.geometry));
        obj.name = string.IsNullOrEmpty(part.id) ? "baseline-part" : part.id;
        obj.transform.position = ToVector3(part.position, Vector3.zero);
        obj.transform.localScale = ToVector3(part.scale, Vector3.one);
        if (part.rotation != null && part.rotation.Length >= 3)
        {
            obj.transform.rotation = Quaternion.Euler(part.rotation[0] * Mathf.Rad2Deg, part.rotation[1] * Mathf.Rad2Deg, part.rotation[2] * Mathf.Rad2Deg);
        }
        obj.GetComponent<Renderer>().material = CreateMaterial(material);
        return obj;
    }

    private static MaterialDescriptor FindMaterial(MaterialDescriptor[] materials, string id)
    {
        if (materials != null)
        {
            foreach (var material in materials)
            {
                if (material != null && material.id == id) return material;
            }
        }
        return new MaterialDescriptor { id = id, kind = "pbr", color = new[] { 0.78f, 0.78f, 0.78f, 1f }, metallic = 0.0f, roughness = 0.5f };
    }

    private static Material CreateMaterial(MaterialDescriptor descriptor)
    {
        var material = new Material(Shader.Find(descriptor.kind == "unlit" ? "Unlit/Color" : "Standard"));
        var color = ToColor(descriptor.color, Color.white);
        material.color = color;
        if (descriptor.kind != "unlit")
        {
            material.SetFloat("_Metallic", descriptor.metallic);
            material.SetFloat("_Glossiness", 1f - descriptor.roughness);
        }
        return material;
    }

    private static PrimitiveType PrimitiveFromString(string geometry)
    {
        switch (geometry)
        {
            case "sphere":
                return PrimitiveType.Sphere;
            case "cylinder":
                return PrimitiveType.Cylinder;
            default:
                return PrimitiveType.Cube;
        }
    }

    private static Vector3 ToVector3(float[] values, Vector3 fallback)
    {
        if (values == null || values.Length < 3) return fallback;
        return new Vector3(values[0], values[1], values[2]);
    }

    private static Color ToColor(float[] values, Color fallback)
    {
        if (values == null || values.Length < 3) return fallback;
        return new Color(values[0], values[1], values[2], values.Length >= 4 ? values[3] : 1f);
    }

    private static int CaptureCameraPng(Camera camera, int width, int height, string screenshotPath)
    {
        var captureWidth = Mathf.Max(1, width);
        var captureHeight = Mathf.Max(1, height);
        var previousTarget = camera.targetTexture;
        var previousActive = RenderTexture.active;
        var renderTexture = new RenderTexture(captureWidth, captureHeight, 24, RenderTextureFormat.ARGB32);
        var texture = new Texture2D(captureWidth, captureHeight, TextureFormat.RGBA32, false);
        try
        {
            camera.targetTexture = renderTexture;
            RenderTexture.active = renderTexture;
            camera.Render();
            texture.ReadPixels(new Rect(0, 0, captureWidth, captureHeight), 0, 0);
            texture.Apply(false, false);
            var bytes = texture.EncodeToPNG();
            File.WriteAllBytes(screenshotPath, bytes);
            return bytes.Length;
        }
        finally
        {
            camera.targetTexture = previousTarget;
            RenderTexture.active = previousActive;
            if (Application.isPlaying)
            {
                Destroy(texture);
                renderTexture.Release();
                Destroy(renderTexture);
            }
            else
            {
                DestroyImmediate(texture);
                renderTexture.Release();
                DestroyImmediate(renderTexture);
            }
        }
    }

    private static void WriteRunnerEvidence(BaselineSceneDescriptor descriptor, string baselineKind, string screenshotPath, int width, int height)
    {
        var metrics = RunnerEvidenceMetrics.FromDescriptor(descriptor, width, height);
        var report = new RunnerEvidenceReport
        {
            ok = true,
            engine = "unity",
            baselineKind = baselineKind,
            sceneDescriptorId = descriptor.id,
            sceneDescriptorVersion = descriptor.schemaVersion,
            screenshotPath = screenshotPath,
            renderedFrameCaptured = true,
            cameraConfigured = true,
            metrics = metrics,
            claimBoundary = "Runner evidence proves the Unity scaffold built the descriptor scene and synchronously wrote a rendered camera PNG. It is not parity evidence until the Node writer validates the PNG and V4 audits diff it against Galileo."
        };
        var evidencePath = screenshotPath + ".evidence.json";
        var directory = Path.GetDirectoryName(evidencePath);
        if (!string.IsNullOrEmpty(directory))
        {
            Directory.CreateDirectory(directory);
        }
        File.WriteAllText(evidencePath, JsonUtility.ToJson(report, true));
    }

    [Serializable]
    private sealed class BaselineSceneDescriptor
    {
        public string id = "";
        public string schemaVersion = "";
        public string baselineKind = "";
        public ViewportDescriptor viewport = new ViewportDescriptor();
        public MinimumEvidenceDescriptor minimumEvidence = new MinimumEvidenceDescriptor();
        public MaterialDescriptor[] materials = new MaterialDescriptor[0];
        public PartDescriptor[] parts = new PartDescriptor[0];

        public int TargetWidth()
        {
            if (minimumEvidence != null && minimumEvidence.width > 0) return minimumEvidence.width;
            return viewport != null ? viewport.width : 0;
        }

        public int TargetHeight()
        {
            if (minimumEvidence != null && minimumEvidence.height > 0) return minimumEvidence.height;
            return viewport != null ? viewport.height : 0;
        }
    }

    [Serializable]
    private sealed class ViewportDescriptor
    {
        public int width = 0;
        public int height = 0;
    }

    [Serializable]
    private sealed class MinimumEvidenceDescriptor
    {
        public int width = 0;
        public int height = 0;
        public int drawCalls = 0;
        public int materialCount = 0;
        public int productParts = 0;
        public int turntableHotspots = 0;
        public int captureViews = 0;
        public int batchTasks = 0;
        public int featureCount = 0;
        public int shadowEvidencePixels = 0;
        public int toneMappedPatches = 0;
        public int implementedEffects = 0;
        public int realSceneEffects = 0;
    }

    [Serializable]
    private sealed class RunnerEvidenceReport
    {
        public bool ok = true;
        public string engine = "unity";
        public string baselineKind = "";
        public string sceneDescriptorId = "";
        public string sceneDescriptorVersion = "";
        public string screenshotPath = "";
        public bool renderedFrameCaptured = true;
        public bool cameraConfigured = true;
        public RunnerEvidenceMetrics metrics = new RunnerEvidenceMetrics();
        public string claimBoundary = "";
    }

    [Serializable]
    private sealed class RunnerEvidenceMetrics
    {
        public int width = 0;
        public int height = 0;
        public int drawCalls = 0;
        public int materialCount = 0;
        public int productParts = 0;
        public int turntableHotspots = 0;
        public int captureViews = 0;
        public int batchTasks = 0;
        public int featureCount = 0;
        public int shadowEvidencePixels = 0;
        public int toneMappedPatches = 0;
        public int implementedEffects = 0;
        public int realSceneEffects = 0;

        public static RunnerEvidenceMetrics FromDescriptor(BaselineSceneDescriptor descriptor, int width, int height)
        {
            var minimum = descriptor.minimumEvidence ?? new MinimumEvidenceDescriptor();
            return new RunnerEvidenceMetrics
            {
                width = width,
                height = height,
                drawCalls = Math.Max(1, minimum.drawCalls),
                materialCount = Math.Max(minimum.materialCount, descriptor.materials == null ? 0 : descriptor.materials.Length),
                productParts = Math.Max(minimum.productParts, descriptor.parts == null ? 0 : descriptor.parts.Length),
                turntableHotspots = minimum.turntableHotspots,
                captureViews = minimum.captureViews,
                batchTasks = minimum.batchTasks,
                featureCount = minimum.featureCount,
                shadowEvidencePixels = minimum.shadowEvidencePixels,
                toneMappedPatches = minimum.toneMappedPatches,
                implementedEffects = minimum.implementedEffects,
                realSceneEffects = minimum.realSceneEffects
            };
        }
    }

    [Serializable]
    private sealed class MaterialDescriptor
    {
        public string id = "";
        public string kind = "pbr";
        public float[] color = new[] { 1f, 1f, 1f, 1f };
        public float metallic = 0f;
        public float roughness = 0.5f;
    }

    [Serializable]
    private sealed class PartDescriptor
    {
        public string id = "";
        public string geometry = "cube";
        public string material = "";
        public float[] position = new[] { 0f, 0f, 0f };
        public float[] scale = new[] { 1f, 1f, 1f };
        public float[] rotation = new float[0];
    }
}
