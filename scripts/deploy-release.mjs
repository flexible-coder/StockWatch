import { existsSync, mkdirSync, readFileSync, renameSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");
const packageJson = JSON.parse(
  readFileSync(join(projectRoot, "package.json"), "utf8"),
);

const releaseName = `crx-${packageJson.name}-${packageJson.version}`;
const releaseZipPath = join(projectRoot, "release", `${releaseName}.zip`);
const deployParentDir = "D:\\Frontend\\Google plugin";
const deployTargetDir = join(deployParentDir, releaseName);
const stagingRoot = join(projectRoot, ".tmp-release-deploy");
const stagingExtractDir = join(stagingRoot, releaseName);

const quotePowerShellLiteral = (value) =>
  `'${value.replaceAll("'", "''")}'`;

const assertSafeDeployTarget = () => {
  const expectedTarget = resolve(deployParentDir, releaseName).toLowerCase();
  const actualTarget = resolve(deployTargetDir).toLowerCase();

  if (actualTarget !== expectedTarget) {
    throw new Error(`Refusing to deploy to unexpected path: ${deployTargetDir}`);
  }
};

const expandArchive = () => {
  const command = [
    "Expand-Archive",
    "-LiteralPath",
    quotePowerShellLiteral(releaseZipPath),
    "-DestinationPath",
    quotePowerShellLiteral(stagingExtractDir),
    "-Force",
  ].join(" ");

  const result = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command],
    {
      encoding: "utf8",
      stdio: "pipe",
    },
  );

  if (result.status !== 0) {
    throw new Error(
      [
        "Failed to extract release zip.",
        result.stdout?.trim(),
        result.stderr?.trim(),
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }
};

const deployRelease = () => {
  assertSafeDeployTarget();

  if (!existsSync(releaseZipPath)) {
    throw new Error(`Release zip not found: ${releaseZipPath}`);
  }

  rmSync(stagingRoot, { recursive: true, force: true });
  mkdirSync(stagingExtractDir, { recursive: true });

  try {
    expandArchive();

    const manifestPath = join(stagingExtractDir, "manifest.json");
    if (!existsSync(manifestPath)) {
      throw new Error(`Extracted extension is missing manifest.json: ${manifestPath}`);
    }

    mkdirSync(deployParentDir, { recursive: true });
    rmSync(deployTargetDir, { recursive: true, force: true });
    renameSync(stagingExtractDir, deployTargetDir);
  } finally {
    rmSync(stagingRoot, { recursive: true, force: true });
  }
};

deployRelease();
console.log(`Deployed ${releaseName} to ${deployTargetDir}`);
