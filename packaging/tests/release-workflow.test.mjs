import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflowUrl = new URL("../../.github/workflows/release-images.yml", import.meta.url);

test("release verification binds to the exact executing workflow reference", async () => {
  const workflow = await readFile(workflowUrl, "utf8");

  assert.match(
    workflow,
    /identity="\$\{\{ github\.server_url \}\}\/\$\{\{ github\.workflow_ref \}\}"/,
  );
  assert.doesNotMatch(
    workflow,
    /release-images\.yml@refs\/heads\/main/,
  );
});
