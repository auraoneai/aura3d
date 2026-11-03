#include <OpenEXR/ImfChannelList.h>
#include <OpenEXR/ImfChromaticitiesAttribute.h>
#include <OpenEXR/ImfCompression.h>
#include <OpenEXR/ImfFrameBuffer.h>
#include <OpenEXR/ImfHeader.h>
#include <OpenEXR/ImfInputFile.h>
#include <OpenEXR/ImfOutputFile.h>
#include <Imath/ImathBox.h>
#include <Imath/ImathVec.h>
#include <Imath/half.h>
#include <algorithm>
#include <cmath>
#include <iostream>
#include <string>
#include <vector>

using namespace OPENEXR_IMF_NAMESPACE;
using namespace IMATH_NAMESPACE;

struct Pixels {
  std::vector<float> y = std::vector<float>(32 * 16);
  std::vector<float> ry = std::vector<float>(16 * 8);
  std::vector<float> by = std::vector<float>(16 * 8);
  std::vector<half> ryHalf = std::vector<half>(16 * 8);
  std::vector<half> byHalf = std::vector<half>(16 * 8);
  std::vector<float> alpha = std::vector<float>(32 * 16);
  std::vector<float> rootRed = std::vector<float>(32 * 16);
};

FrameBuffer frameBuffer(Pixels& pixels, const Box2i& window, bool halfChroma) {
  FrameBuffer frame;
  frame.insert("look.Y", Slice::Make(FLOAT, pixels.y.data(), window, sizeof(float), 32 * sizeof(float)));
  if (halfChroma) {
    frame.insert("look.RY", Slice::Make(HALF, pixels.ryHalf.data(), window, sizeof(half), 16 * sizeof(half), 2, 2));
    frame.insert("look.BY", Slice::Make(HALF, pixels.byHalf.data(), window, sizeof(half), 16 * sizeof(half), 2, 2));
  } else {
    frame.insert("look.RY", Slice::Make(FLOAT, pixels.ry.data(), window, sizeof(float), 16 * sizeof(float), 2, 2));
    frame.insert("look.BY", Slice::Make(FLOAT, pixels.by.data(), window, sizeof(float), 16 * sizeof(float), 2, 2));
  }
  frame.insert("look.A", Slice::Make(FLOAT, pixels.alpha.data(), window, sizeof(float), 32 * sizeof(float)));
  frame.insert("R", Slice::Make(FLOAT, pixels.rootRed.data(), window, sizeof(float), 32 * sizeof(float)));
  return frame;
}

int main(int argc, char** argv) {
  if (argc < 2 || argc > 3) return 2;
  const std::string compression = argc == 3 ? argv[2] : "zip";
  if (compression != "zip" && compression != "zip-half" && compression != "dwab") return 2;
  const bool halfChroma = compression == "zip-half";
  const Box2i window(V2i(-4, -2), V2i(27, 13));
  Pixels original;
  for (int y = 0; y < 16; y++) {
    for (int x = 0; x < 32; x++) {
      const int i = y * 32 + x;
      original.y[i] = 0.5f + float(x) / 64 + float(y) / 128;
      original.alpha[i] = 0.75f;
      original.rootRed[i] = 2.0f + float(x) / 16;
    }
  }
  for (int y = 0; y < 8; y++) {
    for (int x = 0; x < 16; x++) {
      const int i = y * 16 + x;
      original.ry[i] = -0.25f + float(2 * x) / 64;
      original.by[i] = 0.125f + float(2 * y) / 64;
      original.ryHalf[i] = original.ry[i];
      original.byHalf[i] = original.by[i];
    }
  }
  Header header(32, 16);
  header.dataWindow() = window;
  header.displayWindow() = window;
  header.compression() = compression == "dwab" ? DWAB_COMPRESSION : ZIP_COMPRESSION;
  header.channels().insert("look.Y", Channel(FLOAT));
  header.channels().insert("look.RY", Channel(halfChroma ? HALF : FLOAT, 2, 2, true));
  header.channels().insert("look.BY", Channel(halfChroma ? HALF : FLOAT, 2, 2, true));
  header.channels().insert("look.A", Channel(FLOAT));
  header.channels().insert("R", Channel(FLOAT));
  header.insert("chromaticities", ChromaticitiesAttribute(Chromaticities(
      V2f(0.5f, 0.25f), V2f(0.25f, 0.5f), V2f(0.125f, 0.125f), V2f(0.25f, 0.25f))));
  {
    OutputFile output(argv[1], header);
    output.setFrameBuffer(frameBuffer(original, window, halfChroma));
    output.writePixels(16);
  }
  Pixels readback;
  {
    InputFile input(argv[1]);
    input.setFrameBuffer(frameBuffer(readback, window, halfChroma));
    input.readPixels(-2, 13);
  }
  if (halfChroma) for (std::size_t i = 0; i < readback.ry.size(); i++) {
    readback.ry[i] = float(readback.ryHalf[i]);
    readback.by[i] = float(readback.byHalf[i]);
  }
  float maxError = 0;
  const auto compare = [&maxError](const std::vector<float>& expected, const std::vector<float>& actual) {
    for (std::size_t i = 0; i < expected.size(); i++) {
      if (!std::isfinite(actual[i])) return false;
      maxError = std::max(maxError, std::abs(actual[i] - expected[i]));
    }
    return true;
  };
  if (!compare(original.y, readback.y) || !compare(original.ry, readback.ry) ||
      !compare(original.by, readback.by) || !compare(original.alpha, readback.alpha) ||
      !compare(original.rootRed, readback.rootRed)) return 1;
  if (maxError > (compression == "dwab" ? 0.02f : 0.0f)) return 1;
  std::cout << "OpenEXR readback maximum absolute channel sample error: " << maxError << "\n";
  return 0;
}
