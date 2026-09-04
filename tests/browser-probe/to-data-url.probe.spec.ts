import { test } from "@playwright/test";

test("toDataURL after webgl clear", async ({ page }) => {
  await page.goto("file:///private/tmp/commandcode-501/-Users-gurbakshchahal-platforms-aura3d/4cfdf9f3-8e40-4393-8889-2cdb498b1cd8/scratchpad/probe.html");
  const result = await page.evaluate(() => {
    const probe = (window as unknown as { __PROBE__: { render: (c: number[]) => void; read: () => string } }).__PROBE__;
    probe.render([1, 0, 0]);
    const red = probe.read();
    probe.render([0, 1, 0]);
    const green = probe.read();
    return { red: red.slice(0, 64), green: green.slice(0, 64), same: red === green };
  });
  console.log(JSON.stringify(result, null, 2));
});
