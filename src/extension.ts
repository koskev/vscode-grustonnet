import {
  commands,
  window,
  workspace,
  ExtensionContext,
  OutputChannel,
} from 'vscode';

import {
  DidChangeConfigurationNotification,
  Executable,
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
} from 'vscode-languageclient/node';
import { getBinPathExists, update } from './install';
import { installDebugger, registerDebugger } from './debugger';
import { Mutex } from 'async-mutex';
import { registerEvalCommand } from './eval';

let extensionContext: ExtensionContext;
let client: LanguageClient;
let channel: OutputChannel;

const restartMutex = new Mutex();

function getClient() {
  return client;
}

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
      installDebugger(context, channel);
    }
  });
  channel.appendLine("Starting client...")
  await startClient();
  await installDebugger(context, channel);
  await didChangeConfigHandler();

  context.subscriptions.push(
    workspace.onDidChangeConfiguration(didChangeConfigHandler),
    commands.registerCommand('grustonnet.restartLanguageServer', restartClient),
  );
  registerEvalCommand(context, channel, getClient);
  registerDebugger(context, channel, getClient);
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

export function deactivate(): Thenable<void> | undefined {
  if (!client) {
    return undefined;
  }
  return client.stop();
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
