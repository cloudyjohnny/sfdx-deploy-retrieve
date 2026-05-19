# SFDX Deploy & Retrieve

Minimal VS Code extension that adds right-click **Deploy** and **Retrieve** actions
for any file, using the Salesforce CLI (`sf` by default, or `sfdx`) against your
default org / sandbox.

## Features

- Right-click a file in the Explorer, an editor tab, or in the editor itself:
  - **SFDX: Deploy This Source to Default Org**
  - **SFDX: Retrieve This Source from Default Org**
- Streams CLI output to a dedicated **SFDX Deploy & Retrieve** output channel.
- Progress notification with cancel support.

## Requirements

- [Salesforce CLI](https://developer.salesforce.com/tools/salesforcecli) installed and on `PATH`.
- A default org configured (e.g. `sf config set target-org <alias>`), or set
  `sfdxDeployRetrieve.targetOrg` in settings.

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `sfdxDeployRetrieve.cli` | `sf` | CLI binary to invoke (`sf` or `sfdx`). |
| `sfdxDeployRetrieve.targetOrg` | `""` | Username/alias for `--target-org`. Empty = project default. |

## Build & Run

```bash
npm install
npm run compile
```

Then press **F5** in VS Code to launch an Extension Development Host.

## Install (scoped to your Salesforce project)

The extension only activates when the workspace contains an `sfdx-project.json`,
and its right-click menu items only appear in that workspace. So you can safely
install it globally and it will stay invisible everywhere else.

```bash
cd ~/dev/sfdx-deploy-retrieve
npm install
npm run compile
npx vsce package            # produces sfdx-deploy-retrieve-<version>.vsix
code --install-extension sfdx-deploy-retrieve-<version>.vsix
```

Reload VS Code, open your Salesforce project, and right-click any file to deploy
or retrieve it.

To uninstall later:

```bash
code --uninstall-extension cloudyjohnny.sfdx-deploy-retrieve
```
