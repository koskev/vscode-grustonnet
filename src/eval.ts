import * as fs from 'fs';
import * as os from 'os';
import { stringify as stringifyYaml } from 'yaml';
import * as path from 'path';
import {
  ExecuteCommandParams,
  ExecuteCommandRequest,
  LanguageClient,
} from 'vscode-languageclient/node';
import {
  commands,
  window,
  workspace,
  Uri,
  TextEditor,
  ViewColumn,
  OutputChannel,
  ExtensionContext,
} from 'vscode';

const evalFileName = 'jsonnet-eval-result';
function createTmpFile(yaml: boolean): string {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jsonnet-eval'));
  const fileEnding = yaml ? 'yaml' : 'json';
  const tempFile = path.join(tempDir, `${evalFileName}.${fileEnding}`);
  return tempFile;
}

export function registerEvalCommand(
  context: ExtensionContext,
  channel: OutputChannel,
  client: LanguageClient,

) {
  context.subscriptions.push(
    commands.registerCommand('grustonnet.evalFile', evalCommand(channel, client, false)),
  );
}

function evalCommand(
  channel: OutputChannel,
  client: LanguageClient,
  yaml: boolean,
) {
  return async () => {

    const currentFilePath = evalFilePath(window.activeTextEditor);
    channel.appendLine(`Evaluating ${currentFilePath}`);
    const params: ExecuteCommandParams = {
      command: `jsonnet.evalFile`,
      arguments: [currentFilePath]
    };

    // Close previous result tab (named jsonnet-eval-result)
    for (const editor of window.visibleTextEditors) {
      if (editor.document.fileName.includes(evalFileName)) {
        channel.appendLine(`Closing previous result tab ${editor.document.fileName}`);
        await window.showTextDocument(editor.document, { preview: false, viewColumn: ViewColumn.Beside });
        await commands.executeCommand('workbench.action.closeActiveEditor');
      }
    }

    const tempFile = createTmpFile(yaml);
    const uri = Uri.file(tempFile);

    fs.writeFileSync(tempFile, '"Evaluating..."');

    if (workspace.getConfiguration('grustonnet').get('languageServer.continuousEval') === false) {
      evalJsonnet(channel, client, params, yaml, tempFile, true);
    } else {
      // Initial eval
      evalJsonnet(channel, client, params, yaml, tempFile, true);

      // Watch all jsonnet files, trigger eval on change
      const watcher = workspace.createFileSystemWatcher("**/*.*sonnet", true, false, true);
      watcher.onDidChange((e) => {
        channel.appendLine(`File changed: ${e.fsPath}, triggering eval`);
        evalJsonnet(channel, client, params, yaml, tempFile, false);
      });

      // Stop watching when the tab is closed. Only run this once.
      const disposable = window.onDidChangeVisibleTextEditors((editors) => {
        for (const editor of editors) {
          if (editor.document.uri.fsPath === uri.fsPath) {
            return;
          }
        }
        channel.appendLine(`Closed result tab, stopping watcher and deleting temp file ${tempFile}`);
        watcher.dispose();
        fs.unlinkSync(tempFile);
        disposable.dispose();
      });
    }
  };
}
function evalJsonnet(
  channel: OutputChannel,
  client: LanguageClient,
  params: ExecuteCommandParams,
  yaml: boolean,
  tempFile: string,
  display = false,
): void {
  channel.appendLine(`Sending eval request: ${JSON.stringify(params)} for ${tempFile}`);
  client
    .sendRequest(ExecuteCommandRequest.type, params)
    .then((result) => {
      let uri = Uri.file(tempFile);
      fs.writeFileSync(tempFile, result);

      if (yaml) {
        const file = fs.readFileSync(tempFile, 'utf8');
        const parsed = JSON.parse(file);
        const yamlString = stringifyYaml(parsed);
        uri = Uri.file(tempFile);
        fs.writeFileSync(tempFile, yamlString);
      }
      if (display) {
        window.showTextDocument(uri, {
          preview: true,
          viewColumn: ViewColumn.Beside,
          preserveFocus: true,
        });
      }
    })
    .catch((err) => {
      window.showErrorMessage(err.message);
      fs.writeFileSync(tempFile, err.message);
      if (display) {
        const uri = Uri.file(tempFile);
        window.showTextDocument(uri, {
          preview: true,
          viewColumn: ViewColumn.Beside,
          preserveFocus: true,
        });
      }
    });
}

function evalFilePath(editor: TextEditor): string {
  return editor.document.uri.fsPath.replace(/\\/g, '/');
}
