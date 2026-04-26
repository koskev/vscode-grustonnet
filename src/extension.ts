import * as path from 'path';
import {
  commands,
  debug,
  window,
  workspace,
  ExtensionContext,
  Uri,
  OutputChannel,
  TextEditor,
  ViewColumn,
  ProviderResult,
  WorkspaceFolder,
  DebugConfiguration,
  DebugConfigurationProviderTriggerKind,
} from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import { stringify as stringifyYaml } from 'yaml';

import {
  DidChangeConfigurationNotification,
  Executable,
  ExecuteCommandParams,
  ExecuteCommandRequest,
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
} from 'vscode-languageclient/node';
import { getBinPathExists, update } from './install';
import { JsonnetDebugAdapterDescriptorFactory } from './debugger';
import { Mutex } from 'async-mutex';

let extensionContext: ExtensionContext;
let client: LanguageClient;
let channel: OutputChannel;
const evalFileName = 'jsonnet-eval-result';

const restartMutex = new Mutex();

export async function activate(context: ExtensionContext): Promise<void> {
  channel = window.createOutputChannel('grustonnet plugin');
  extensionContext = context;

  channel.appendLine("Starting update checks...")
  update(extensionContext, channel, 'languageServer').then((res) => {
    if (res) {
      restartClient();
    }
  });
  update(extensionContext, channel, 'debugger').then((res) => {
    if (res) {
      installDebugger(context);
    }
  });
  channel.appendLine("Starting client...")
  await startClient();
  await installDebugger(context);
  await didChangeConfigHandler();
  context.subscriptions.push(
    debug.registerDebugConfigurationProvider(
      'jsonnet',
      {
        provideDebugConfigurations(_folder: WorkspaceFolder | undefined): ProviderResult<DebugConfiguration[]> {
          return [
            {
              name: 'Debug current Jsonnet file',
              request: 'launch',
              type: 'jsonnet',
              program: '${file}',
            },
          ];
        },
        async resolveDebugConfiguration(_folder, debugConfiguration, _token) {
          const params: ExecuteCommandParams = {
            command: "config.jpaths",
          };
          debugConfiguration.jpaths = await client.sendRequest(ExecuteCommandRequest.type, params);
          params.command = "config.extvars";
          debugConfiguration.extvars = await client.sendRequest(ExecuteCommandRequest.type, params);
          params.command = "config.extcode";
          debugConfiguration.extcode = await client.sendRequest(ExecuteCommandRequest.type, params);

          channel.appendLine(`Starting debugger with ${JSON.stringify(debugConfiguration)}`)

          return debugConfiguration

        },
      },
      DebugConfigurationProviderTriggerKind.Dynamic
    ),
    commands.registerCommand('grustonnet.debugEditorContents', (resource: Uri) => {
      let targetResource = resource;
      if (!targetResource && window.activeTextEditor) {
        targetResource = window.activeTextEditor.document.uri;
      }
      if (targetResource) {
        debug.startDebugging(undefined, {
          type: 'jsonnet',
          name: 'Debug File',
          request: 'launch',
          program: targetResource.fsPath,
        });
      }
    })
  );

  context.subscriptions.push(
    workspace.onDidChangeConfiguration(didChangeConfigHandler),
    commands.registerCommand('grustonnet.restartLanguageServer', restartClient),
    commands.registerCommand('grustonnet.evalFile', evalCommand(false)),
  );
}

async function restartClient() {
  const release = await restartMutex.acquire();
  try {
    // This abomination is used to ignore errors while stopping the client ensuring both functions are called
    try {
      await client.stop();
    } catch { }
    await startClient();
    await didChangeConfigHandler();
  } finally {
    release();
  }
}

function evalCommand(yaml: boolean) {
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
      evalJsonnet(params, yaml, tempFile, true);
    } else {
      // Initial eval
      evalJsonnet(params, yaml, tempFile, true);

      // Watch all jsonnet files, trigger eval on change
      const watcher = workspace.createFileSystemWatcher("**/*.*sonnet", true, false, true);
      watcher.onDidChange((e) => {
        channel.appendLine(`File changed: ${e.fsPath}, triggering eval`);
        evalJsonnet(params, yaml, tempFile, false);
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

function createTmpFile(yaml): string {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jsonnet-eval'));
  const fileEnding = yaml ? 'yaml' : 'json';
  const tempFile = path.join(tempDir, `${evalFileName}.${fileEnding}`);
  return tempFile;
}

function evalJsonnet(params: ExecuteCommandParams, yaml: boolean, tempFile: string, display = false): void {
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

export function deactivate(): Thenable<void> | undefined {
  if (!client) {
    return undefined;
  }
  return client.stop();
}

async function installDebugger(context: ExtensionContext): Promise<void> {
  const binPath = await getBinPathExists(extensionContext, channel, 'debugger');
  if (!binPath) {
    return;
  }
  debug.registerDebugAdapterDescriptorFactory('jsonnet', new JsonnetDebugAdapterDescriptorFactory(context, binPath));
}

async function startClient(): Promise<void> {

  const binPath = await getBinPathExists(extensionContext, channel, 'languageServer');
  if (!binPath) {
    channel.appendLine("Binpath is empty. Not starting language server")
    return;
  }
  const executable: Executable = {
    command: binPath,
    args: [],
    options: {
      env: process.env,
    },
  };
  channel.appendLine(`Jsonnet Language Server will start: '${executable.command} ${executable.args.join(' ')}'`);

  const serverOptions: ServerOptions = {
    run: executable,
    debug: executable,
  };

  // Options to control the language client
  const clientOptions: LanguageClientOptions = {
    // Register the server for jsonnet files
    documentSelector: [{ scheme: 'file', language: 'jsonnet' }],
  };

  // Create the language client and start the client.
  client = new LanguageClient('grustonnetLanguageServer', 'Grustonnet Language Server', serverOptions, clientOptions);

  // Start the client. This will also launch the server
  client.start();
}

async function didChangeConfigHandler() {
  const workspaceConfig = workspace.getConfiguration('grustonnet');
  client.sendNotification(DidChangeConfigurationNotification.type, {
    settings: workspaceConfig.get('languageServer.config'),
  });
}
