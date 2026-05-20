// Galileo3D V4 Unity asset-import workflow evidence runner.
// Copy this file into a real Unity project under Assets/Galileo3D/V4ExternalBaselines.
// Run in batchmode with:
//   -executeMethod V4ExternalAssetImportWorkflowRunner.CaptureFromCommandLine --asset <path-to-gltf-or-glb> --evidence <repo>/tests/reports/v4-unity-asset-import-workflow.evidence.json
// The runner writes ok=false unless Unity actually imports the asset and exposes mesh/material/texture metrics.

#if UNITY_EDITOR
using System;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEngine;

public static class V4ExternalAssetImportWorkflowRunner
{
    public static void CaptureFromCommandLine()
    {
        string assetPath = Arg("--asset");
        string evidencePath = Arg("--evidence");
        if (string.IsNullOrEmpty(evidencePath))
        {
            throw new InvalidOperationException("Missing --evidence <path> for V4 Unity asset-import workflow evidence.");
        }
        Directory.CreateDirectory(Path.GetDirectoryName(evidencePath));
        var conversionRequired = new[] { "dae", "fbx", "usd", "usdz" };
        var nativeSupported = new[] { "glb", "gltf", "obj" };
        bool assetExists = !string.IsNullOrEmpty(assetPath) && File.Exists(assetPath);
        string unityAssetPath = assetExists ? CopyIntoAssets(assetPath) : "";
        if (assetExists)
        {
            AssetDatabase.ImportAsset(unityAssetPath, ImportAssetOptions.ForceUpdate | ImportAssetOptions.ImportRecursive);
            AssetDatabase.Refresh();
        }
        UnityEngine.Object[] imported = assetExists ? AssetDatabase.LoadAllAssetsAtPath(unityAssetPath) : Array.Empty<UnityEngine.Object>();
        int meshes = imported.Count((asset) => asset is Mesh);
        int materials = imported.Count((asset) => asset is Material);
        int textures = imported.Count((asset) => asset is Texture);
        int animationClips = imported.Count((asset) => asset is AnimationClip);
        bool ok = assetExists && meshes >= 1 && materials >= 1 && textures >= 1;
        string json = "{" +
            "\n  \"ok\": " + Bool(ok) + "," +
            "\n  \"engine\": \"unity\"," +
            "\n  \"workflowKind\": \"asset-import\"," +
            "\n  \"editorProjectOpened\": true," +
            "\n  \"assetImportWorkflowRan\": " + Bool(assetExists) + "," +
            "\n  \"assetPath\": " + Json(assetPath) + "," +
            "\n  \"importedFormats\": [\"glb\", \"gltf\"]," +
            "\n  \"nativeSupportedFormats\": [" + string.Join(", ", nativeSupported.Select(Json)) + "]," +
            "\n  \"conversionRequiredFormats\": [" + string.Join(", ", conversionRequired.Select(Json)) + "]," +
            "\n  \"metrics\": {" +
            "\n    \"editorProjectOpened\": true," +
            "\n    \"assetImportWorkflowRan\": " + Bool(assetExists) + "," +
            "\n    \"importedGltfAssets\": " + (assetExists ? 1 : 0) + "," +
            "\n    \"importedMeshes\": " + meshes + "," +
            "\n    \"importedMaterials\": " + materials + "," +
            "\n    \"importedTextures\": " + textures + "," +
            "\n    \"importedAnimationClips\": " + animationClips + "," +
            "\n    \"conversionRequiredFormats\": " + conversionRequired.Length + "," +
            "\n    \"nativeSupportedFormats\": " + nativeSupported.Length +
            "\n  }," +
            "\n  \"claimBoundary\": \"This sidecar is valid only when produced by a real Unity editor import run. It allows Galileo3D bounded native OBJ geometry import, but does not claim native FBX/USD/USDZ/DAE support.\"" +
            "\n}\n";
        File.WriteAllText(evidencePath, json);
        if (!ok)
        {
            throw new InvalidOperationException("Unity asset-import workflow did not expose enough imported mesh/material/texture metrics. Evidence written to " + evidencePath);
        }
    }

    private static string Arg(string name)
    {
        string[] args = Environment.GetCommandLineArgs();
        for (int index = 0; index < args.Length - 1; index++)
        {
            if (args[index] == name) return args[index + 1];
        }
        return "";
    }

    private static string CopyIntoAssets(string sourcePath)
    {
        string extension = Path.GetExtension(sourcePath);
        string target = "Assets/Galileo3D/V4ExternalBaselines/Imported/v4-import-workflow" + extension;
        Directory.CreateDirectory(Path.GetDirectoryName(target));
        File.Copy(sourcePath, target, true);
        return target;
    }

    private static string Bool(bool value) => value ? "true" : "false";
    private static string Json(string value) => "\"" + value.Replace("\\", "\\\\").Replace("\"", "\\\"") + "\"";
}
#endif
