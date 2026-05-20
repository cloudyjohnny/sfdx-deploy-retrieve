import * as vscode from 'vscode';
import { spawn } from 'child_process';
import * as path from 'path';
import * as os from 'os';

let output: vscode.OutputChannel;

export async function activate(context: vscode.ExtensionContext) {
  output = vscode.window.createOutputChannel('SFDX Deploy & Retrieve');

  context.subscriptions.push(
    vscode.commands.registerCommand('sfdxDeployRetrieve.deploy', (uri?: vscode.Uri) =>
      run('deploy', uri),
    ),
    vscode.commands.registerCommand('sfdxDeployRetrieve.retrieve', (uri?: vscode.Uri) =>
      run('retrieve', uri),
    ),
    vscode.commands.registerCommand('sfdxDeployRetrieve.runTests', (uri?: vscode.Uri) =>
      run('runTests', uri),
    ),
    output,
  );

  await updateSfdxContext();

  const watcher = vscode.workspace.createFileSystemWatcher('**/sfdx-project.json');
  watcher.onDidCreate(updateSfdxContext);
  watcher.onDidDelete(updateSfdxContext);
  context.subscriptions.push(
    watcher,
    vscode.workspace.onDidChangeWorkspaceFolders(updateSfdxContext),
  );
}

async function updateSfdxContext() {
  const matches = await vscode.workspace.findFiles('**/sfdx-project.json', '**/node_modules/**', 1);
  await vscode.commands.executeCommand(
    'setContext',
    'sfdxDeployRetrieve.isSfdxProject',
    matches.length > 0,
  );
}

function expandHome(p: string): string {
  if (p.startsWith('~')) {
    return path.join(os.homedir(), p.slice(1));
  }
  return p;
}

export function deactivate() {}

type Action = 'deploy' | 'retrieve' | 'runTests';

async function run(action: Action, uri?: vscode.Uri) {
  const target = uri ?? vscode.window.activeTextEditor?.document.uri;
  if (!target || target.scheme !== 'file') {
    vscode.window.showErrorMessage('No file selected for SFDX ' + action + '.');
    return;
  }

  const cfg = vscode.workspace.getConfiguration('sfdxDeployRetrieve');
  const cliSetting = cfg.get<string>('cli', 'sf');
  const cliPathSetting = cfg.get<string>('cliPath', '').trim();
  const cliPath = cliPathSetting ? expandHome(cliPathSetting) : cliSetting;
  // `cli` is still the logical name (sf vs sfdx) used to pick the right flags.
  const cli = cliPathSetting ? path.basename(cliPathSetting).replace(/\.(exe|cmd)$/i, '') : cliSetting;
  const targetOrg = cfg.get<string>('targetOrg', '').trim();

  const workspaceFolder = vscode.workspace.getWorkspaceFolder(target);
  const cwd = workspaceFolder?.uri.fsPath ?? path.dirname(target.fsPath);

  let args: string[];
  let label: string;

  if (action === 'runTests') {
    const fileName = path.basename(target.fsPath);
    if (!/\.cls$/i.test(fileName)) {
      vscode.window.showErrorMessage(
        `Cannot run Apex tests: ${fileName} is not an Apex class (.cls) file.`,
      );
      return;
    }
    const className = fileName.replace(/\.cls$/i, '');
    args =
      cli === 'sfdx'
        ? [
            'force:apex:test:run',
            '--classnames',
            className,
            '--resultformat',
            'human',
            '--codecoverage',
            '--detailedcoverage',
            '--wait',
            '10',
            '--synchronous',
          ]
        : [
            'apex',
            'run',
            'test',
            '--class-names',
            className,
            '--result-format',
            'human',
            '--code-coverage',
            '--detailed-coverage',
            '--wait',
            '10',
            '--synchronous',
          ];
    label = `Running Apex tests in ${className}`;
  } else {
    args =
      cli === 'sfdx'
        ? [
            action === 'deploy' ? 'force:source:deploy' : 'force:source:retrieve',
            '-p',
            target.fsPath,
            '--forceoverwrite',
          ]
        : [
            'project',
            action,
            'start',
            '--source-dir',
            target.fsPath,
            '--ignore-conflicts',
          ];
    label = `${action === 'deploy' ? 'Deploying' : 'Retrieving'} ${path.basename(target.fsPath)}`;
  }

  if (targetOrg) {
    args.push(cli === 'sfdx' ? '-u' : '--target-org', targetOrg);
  }

  output.show(true);
  output.appendLine(`\n$ ${cliPath} ${args.join(' ')}`);

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: label, cancellable: true },
    (_progress, token) =>
      new Promise<void>((resolve) => {
        const child = spawn(cliPath, args, { cwd, shell: process.platform === 'win32' });

        token.onCancellationRequested(() => child.kill());

        child.stdout.on('data', (d) => output.append(d.toString()));
        child.stderr.on('data', (d) => output.append(d.toString()));

        child.on('error', (err: NodeJS.ErrnoException) => {
          if (err.code === 'ENOENT') {
            vscode.window
              .showErrorMessage(
                `Could not find "${cliPath}" on PATH. VS Code launched from the Dock often doesn't inherit your shell PATH. Set "sfdxDeployRetrieve.cliPath" to the absolute path returned by \`which ${cli}\`.`,
                'Open Settings',
              )
              .then((choice) => {
                if (choice === 'Open Settings') {
                  vscode.commands.executeCommand(
                    'workbench.action.openSettings',
                    'sfdxDeployRetrieve.cliPath',
                  );
                }
              });
          } else {
            vscode.window.showErrorMessage(`Failed to launch ${cliPath}: ${err.message}`);
          }
          resolve();
        });

        child.on('close', (code) => {
          if (code === 0) {
            vscode.window.showInformationMessage(`${label} succeeded.`);
          } else {
            vscode.window.showErrorMessage(
              `${label} failed (exit ${code}). See "SFDX Deploy & Retrieve" output for details.`,
            );
          }
          resolve();
        });
      }),
  );
}
