const fs = require("fs");
const path = require("path");

const templatePath = path.join(
  __dirname,
  "..",
  "node_modules",
  "app-builder-lib",
  "templates",
  "nsis",
  "installSection.nsh"
);

const oldBlock = `# must be called before uninstallOldVersion
!insertmacro setLinkVars`;

const newBlock = `# must be called before legacy install cleanup
!insertmacro setLinkVars`;

const oldUninstall = `!insertmacro uninstallOldVersion SHELL_CONTEXT
!insertmacro handleUninstallResult SHELL_CONTEXT

\${if} $installMode == "all"
  !insertmacro uninstallOldVersion HKEY_CURRENT_USER
  !insertmacro handleUninstallResult HKEY_CURRENT_USER
\${endIf}`;

const previousNewUninstallBare = `!insertmacro cwnPrepareLegacyInstallRoot SHELL_CONTEXT

\${if} $installMode == "all"
  !insertmacro cwnPrepareLegacyInstallRoot HKEY_CURRENT_USER
\${endIf}`;

const previousNewUninstallWithHandler = `!insertmacro cwnPrepareLegacyInstallRoot SHELL_CONTEXT
!insertmacro handleUninstallResult SHELL_CONTEXT

\${if} $installMode == "all"
  !insertmacro cwnPrepareLegacyInstallRoot HKEY_CURRENT_USER
  !insertmacro handleUninstallResult HKEY_CURRENT_USER
\${endIf}`;

const newUninstall = `!insertmacro cwnPrepareLegacyInstallRoot SHELL_CONTEXT
!insertmacro handleUninstallResult SHELL_CONTEXT

\${if} $installMode == "all"
  !insertmacro cwnPrepareLegacyInstallRoot HKEY_CURRENT_USER
  !insertmacro handleUninstallResult HKEY_CURRENT_USER
\${endIf}`;

const keepCompilerReference = `

# Keep the default uninstall function referenced so makensis does not turn its
# unused-function warning into a build error. This branch is never executed.
\${if} 0 == 1
  !insertmacro uninstallOldVersion SHELL_CONTEXT
\${endIf}`;

if (!fs.existsSync(templatePath)) {
  throw new Error(`NSIS installSection template not found: ${templatePath}`);
}

let text = fs.readFileSync(templatePath, "utf8");

if (text.includes(newUninstall + keepCompilerReference)) {
  console.log("NSIS installSection template already patched.");
  process.exit(0);
}

if (text.includes(newUninstall)) {
  text = text.replace(newUninstall, newUninstall + keepCompilerReference);
  fs.writeFileSync(templatePath, text);
  console.log("Updated patched electron-builder NSIS installSection template.");
  process.exit(0);
}

if (text.includes(previousNewUninstallWithHandler)) {
  text = text.replace(previousNewUninstallWithHandler, newUninstall + keepCompilerReference);
  fs.writeFileSync(templatePath, text);
  console.log("Updated patched electron-builder NSIS installSection template.");
  process.exit(0);
}

if (text.includes(previousNewUninstallBare)) {
  text = text.replace(previousNewUninstallBare, newUninstall + keepCompilerReference);
  fs.writeFileSync(templatePath, text);
  console.log("Updated patched electron-builder NSIS installSection template.");
  process.exit(0);
}

if (!text.includes(oldUninstall)) {
  throw new Error("NSIS installSection uninstall block did not match the expected electron-builder template.");
}

text = text.replace(oldBlock, newBlock).replace(oldUninstall, newUninstall + keepCompilerReference);
fs.writeFileSync(templatePath, text);
console.log("Patched electron-builder NSIS installSection template.");
