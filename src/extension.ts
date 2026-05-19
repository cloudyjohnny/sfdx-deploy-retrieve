import * as vscode from 'vscode';
import { spawn } from 'child_process';
import * as path from 'path';

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

export function deactivate() {}

async function run(action: 'deploy' | 'retrieve', uri?: vscode.Uri) {
  const target = uri ?? vscode.window.activeTextEditor?.document.uri;
  if (!target || target.scheme !== 'file') {
    vscode.window.showErrorMessage('No file selected for SFDX ' + action + '.');
    return;
  }

  const cfg = vscode.workspace.getConfiguration('sfdxDeployRetrieve');
  const cli = cfg.get<string>('cli', 'sf');
  const targetOrg = cfg.get<string>('targetOrg', '').trim();

  const workspaceFolder = vscode.workspace.getWorkspaceFolder(target);
  const cwd = workspaceFolder?.uri.fsPath ?? path.dirname(target.fsPath);

  const args =
    cli === 'sfdx'
      ? [
          action === 'deploy' ? 'force:source:deploy' : 'force:source:retrieve',
          '-p',
          target.fsPath,
        ]
      : ['project', action, 'start', '--source-dir', target.fsPath];

  if (targetOrg) {
    args.push(cli === 'sfdx' ? '-u' : '--target-org', targetOrg);
  }

  const label = `${action === 'deploy' ? 'Deploying' : 'Retrieving'} ${path.basename(target.fsPath)}`;
  output.show(true);
  output.appendLine(`\n$ ${cli} ${args.join(' ')}`);

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: label, cancellable: true },
    (_progress, token) =>
      new Promise<void>((resolve) => {
        const child = spawn(cli, args, { cwd, shell: process.platform === 'win32' });

        token.onCancellationRequested(() => child.kill());

        child.stdout.on('data', (d) => output.append(d.toString()));
        child.stderr.on('data', (d) => output.append(d.toString()));

        child.on('error', (err) => {
          vscode.window.showErrorMessage(`Failed to launch ${cli}: ${err.message}`);
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
